import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { 
  GenerateRegistrationOptionsOpts, 
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts, 
  VerifyAuthenticationResponseOpts,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse
} from "@simplewebauthn/server";
import type { 
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture
} from "@simplewebauthn/types";
import { v4 as uuidv4 } from "uuid"; // Import UUID for challenge IDs

// Initialize Firebase Admin SDK (if not already done in index.ts)
// Consider moving initialization to index.ts if it isn't already there
// Removed initialization block - assuming it's done in index.ts
// if (admin.apps.length === 0) {
//   admin.initializeApp();
// }

const db = admin.firestore();

// --- Configuration --- Relying Party (RP) details --- 
// Use base domain for RP ID for better cross-subdomain Passkey usability
const rpID = functions.config().webauthn?.rp_id || "autonomyheroes.com"; // Set via `firebase functions:config:set webauthn.rp_id=...`
const rpName = "Autonomy Heroes Time Tracking"; 

// Handle multiple origins (comma-separated in config, array in code)
const defaultOrigins = [
  "http://localhost:5173", // Default for frontend dev (e.g., hours)
  "http://localhost:5174"  // Default for frontend dev (e.g., admin)
  // Add other local origins if needed
];
// Set via `firebase functions:config:set webauthn.origins=https://origin1,https://origin2`
const configuredOrigins = functions.config().webauthn?.origins; 
const expectedOrigins: string[] = configuredOrigins 
  ? configuredOrigins.split(",").map((s: string) => s.trim()) 
  : defaultOrigins;

// Ensure rpID is valid for the expected origins (SimpleWebAuthn might do this check)
// Consider adding validation if needed.

interface StoredCredential {
    credentialID: string; // Base64URL encoded
    publicKey: string; // Base64 encoded
    counter: number;
    transports?: AuthenticatorTransportFuture[];
    // Add any other metadata you want to store, e.g., device name, createdAt
    createdAt?: admin.firestore.Timestamp;
    lastUsedAt?: admin.firestore.Timestamp;
    deviceName?: string;
}

// Helper to get user credentials with string ID (needed for excludeCredentials)
async function getUserCredentials(userId: string): Promise<StoredCredential[]> {
  const credsSnapshot = await db.collection("users").doc(userId).collection("passkeys").get();
  if (credsSnapshot.empty) {
    return [];
  }
  return credsSnapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>) => {
    return doc.data() as StoredCredential;
  });
}

// Helper to save a new credential
async function saveCredential(userId: string, cred: StoredCredential): Promise<void> {
  const credentialIdBase64Url = cred.credentialID;
  await db.collection("users").doc(userId).collection("passkeys").doc(credentialIdBase64Url).set({
    ...cred,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Helper to update the counter for a credential
async function updateCredentialCounter(userId: string, credentialID: string, newCounter: number): Promise<void> {
  await db.collection("users").doc(userId).collection("passkeys").doc(credentialID).update({
    counter: newCounter,
    lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// --- Cloud Functions (V2 Syntax) --- 

// Constants for challenge management (Registration)
const CHALLENGE_FIELD = "_currentWebAuthnChallenge";
const CHALLENGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Constants for Authentication Challenge storage
const AUTH_CHALLENGE_COLLECTION = "webAuthnAuthChallenges";
// Use AUTH_CHALLENGE_TIMEOUT_MS for consistency
const AUTH_CHALLENGE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes for authentication 

/**
 * Generates options for WebAuthn registration (V2).
 */
export const webauthnGenerateRegistrationOptions = onCall(async (request: CallableRequest<any>) => {
  if (!request.auth) {
    // V2 uses HttpsError from firebase-functions/v2/https
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated to register a passkey.");
  }
  const userId = request.auth.uid;
  const userEmail = request.auth.token.email; 

  const existingCredentials = await getUserCredentials(userId);

  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    // SimpleWebAuthn expects userID as a Buffer/Uint8Array
    userID: Buffer.from(userId), // Convert string UID to Buffer
    userName: userEmail || userId, 
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.credentialID, 
      type: "public-key",
      transports: cred.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "preferred",
    },
  };
  const options = await generateRegistrationOptions(opts);

  // Store the challenge temporarily on the user document
  await db.collection("users").doc(userId).set({
    [CHALLENGE_FIELD]: {
      challenge: options.challenge,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + CHALLENGE_TIMEOUT_MS)
    }
  }, { merge: true });

  // Optional: Schedule a function to clean up expired challenges later if needed

  return options;
});

/**
 * Verifies the registration response and saves the new credential (V2).
 */
export const webauthnVerifyRegistration = onCall(async (request: CallableRequest<RegistrationResponseJSON>) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated to verify a passkey registration.");
  }
  const userId = request.auth.uid;
  const data = request.data; // Extract payload
    
  // Retrieve the stored challenge from the user document
  const userDoc = await db.collection("users").doc(userId).get();
  const storedChallengeData = userDoc.data()?.[CHALLENGE_FIELD];

  if (!storedChallengeData || !storedChallengeData.challenge) {
    throw new functions.https.HttpsError("failed-precondition", "No registration challenge found for this user. Please try registering again.");
  }

  // Check for expiry
  if (storedChallengeData.expiresAt.toMillis() < Date.now()) {
    // Clean up expired challenge before throwing
    await db.collection("users").doc(userId).update({ [CHALLENGE_FIELD]: admin.firestore.FieldValue.delete() });
    throw new functions.https.HttpsError("deadline-exceeded", "Registration challenge expired. Please try registering again.");
  }

  const expectedChallenge = storedChallengeData.challenge;

  let verification: VerifiedRegistrationResponse;
  try {
    const opts: VerifyRegistrationResponseOpts = {
      response: data,
      expectedChallenge: expectedChallenge, 
      expectedOrigin: expectedOrigins, // Use the array of origins
      expectedRPID: rpID,
      requireUserVerification: true, 
    };
    verification = await verifyRegistrationResponse(opts);
  } catch (error: any) { 
    // Clean up challenge on verification error
    await db.collection("users").doc(userId).update({ [CHALLENGE_FIELD]: admin.firestore.FieldValue.delete() });
    console.error("Registration verification failed:", error);
    throw new functions.https.HttpsError("invalid-argument", `Registration verification failed: ${error.message}`);
  }
        
  const { verified, registrationInfo } = verification;

  // Clean up challenge immediately after attempting verification
  await db.collection("users").doc(userId).update({ [CHALLENGE_FIELD]: admin.firestore.FieldValue.delete() });

  if (verified && registrationInfo) {
    const { credentialPublicKey, credentialID, counter } = registrationInfo;
    const credentialIdBase64Url = Buffer.from(credentialID).toString("base64url");
    const credDoc = await db.collection("users").doc(userId).collection("passkeys").doc(credentialIdBase64Url).get();
    if (credDoc.exists) {
      // V2 uses HttpsError from firebase-functions/v2/https
      throw new functions.https.HttpsError("already-exists", "This authenticator is already registered.");
    }
    const publicKeyBase64 = Buffer.from(credentialPublicKey).toString("base64");
    let deviceName = "Unknown Device";
    try {
      const clientDataString = Buffer.from(data.response.clientDataJSON, "base64url").toString("utf8");
      const clientData = JSON.parse(clientDataString);
      deviceName = clientData.origin || deviceName;
    } catch (parseError) {
      console.warn("Could not parse clientDataJSON to get origin:", parseError);
    }
    const newCredential: StoredCredential = {
      credentialID: credentialIdBase64Url,
      publicKey: publicKeyBase64,
      counter,
      transports: data.response.transports || [],
      deviceName: deviceName 
    };
    await saveCredential(userId, newCredential);
    return { verified: true };
  } else {
    throw new functions.https.HttpsError("internal", "Registration verification returned negative.");
  }
});

// --- Interfaces specific to Authentication Options ---
interface GenerateAuthOptionsPayload {
    userId?: string; // Optional: Client might pass userId to hint which credentials to allow
}

// Define the structure of the object returned to the client
// It includes the options generated by @simplewebauthn/server (minus the challenge)
// plus the challengeId needed for verification.
interface GenerateAuthOptionsResponse extends Omit<GenerateAuthenticationOptionsOpts, "challenge"> {
    challengeId: string; 
}

/**
 * Generates options for WebAuthn authentication (V2).
 * Stores challenge securely and returns options + challenge ID.
 */
export const webauthnGenerateAuthenticationOptions = onCall(async (request: CallableRequest<GenerateAuthOptionsPayload>): Promise<GenerateAuthOptionsResponse> => {
  const data = request.data || {}; // Ensure data is an object
  const userId = data?.userId; // Optional: Client might pass userId to hint which credentials to allow
    
  let allowCredentials: { id: string, type: "public-key", transports?: AuthenticatorTransportFuture[] }[] | undefined = undefined; // Initialize as undefined

  if (userId) {
    try {
      const userCredentials = await getUserCredentials(userId);
      if (userCredentials && userCredentials.length > 0) {
        allowCredentials = userCredentials.map(cred => ({
          id: cred.credentialID, // This should already be base64url string from Firestore
          type: "public-key",
          transports: cred.transports,
        }));
        console.log(`Found ${allowCredentials.length} credentials for user ${userId}`);
      } else {
        console.log(`No credentials found for user ${userId}, allowing any.`);
      }
    } catch (error) {
      console.error(`Error fetching credentials for user ${userId}:`, error);
      // Decide if you want to throw or proceed allowing any credential
      // Proceeding cautiously by allowing any credential if fetch fails
      allowCredentials = undefined;
    }
  } else {
    console.log("No userId provided, allowing any credential (discoverable credential flow).");
    allowCredentials = undefined; // Explicitly undefined for discoverable credentials
  }

  // Generate temporary options internally with a challenge
  const tempOpts: GenerateAuthenticationOptionsOpts = {
    rpID, // Include rpID here
    allowCredentials: allowCredentials,
    userVerification: "preferred",
  };
    
  let optionsWithChallenge: GenerateAuthenticationOptionsOpts;
  try {
    // generateAuthenticationOptions returns PublicKeyCredentialRequestOptionsJSON,
    // which might not have all opts fields. We need the challenge from it.
    const generatedOptions = await generateAuthenticationOptions(tempOpts);
    // Re-construct with the challenge to satisfy internal needs if necessary,
    // though simple-webauthn likely just uses the challenge input.
    optionsWithChallenge = { ...tempOpts, ...generatedOptions }; 
    console.log("Generated temporary auth options with challenge.");
  } catch(error) {
    console.error("Error generating temporary authentication options:", error);
    throw new functions.https.HttpsError("internal", "Failed to generate authentication options.");
  }

  const challengeId = uuidv4();
  const challengeToStore = optionsWithChallenge.challenge;

  if (!challengeToStore) {
    console.error("Challenge was unexpectedly empty after generation.");
    throw new functions.https.HttpsError("internal", "Failed to generate challenge string.");
  }
    
  // Store the challenge securely in Firestore
  try {
    await db.collection(AUTH_CHALLENGE_COLLECTION).doc(challengeId).set({
      challenge: challengeToStore,
      userId: userId || null,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + AUTH_CHALLENGE_TIMEOUT_MS)
    });
    console.log(`Stored auth challenge ${challengeId} for user ${userId || "any"}`);
  } catch (error) {
    console.error(`Error storing auth challenge ${challengeId}:`, error);
    throw new functions.https.HttpsError("internal", "Failed to save authentication challenge.");
  }

  // Prepare the response payload: options (excluding challenge) + challengeId
  // Construct explicitly to match GenerateAuthOptionsResponse interface
  const responsePayload: GenerateAuthOptionsResponse = {
    // Include fields from GenerateAuthenticationOptionsOpts excluding challenge
    rpID: optionsWithChallenge.rpID, // Ensure rpID is included
    allowCredentials: optionsWithChallenge.allowCredentials,
    userVerification: optionsWithChallenge.userVerification,
    timeout: optionsWithChallenge.timeout, // Include other potential fields from the generated options
    extensions: optionsWithChallenge.extensions, // Include extensions if present
    // DO NOT include challenge
    challengeId: challengeId // Add the ID for retrieval
  };

  return responsePayload;
});

/**
 * Verifies the authentication response and issues a Firebase Custom Token (V2).
 * Expects response and challengeId from client.
 */
// Uncomment the interface definition
interface VerifyAuthPayload {
    challengeId: string;
    authResponse: AuthenticationResponseJSON;
}

export const webauthnVerifyAuthentication = onCall(async (request: CallableRequest<VerifyAuthPayload>) => {
  const { challengeId, authResponse } = request.data;

  if (!challengeId || !authResponse) {
    throw new functions.https.HttpsError("invalid-argument", "Missing challengeId or authResponse in request data.");
  }

  // 1. Retrieve the securely stored challenge document
  const challengeDocRef = db.collection(AUTH_CHALLENGE_COLLECTION).doc(challengeId);
  let challengeDoc: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData>;
  let expectedChallenge: string | undefined;

  try {
    challengeDoc = await challengeDocRef.get();

    if (!challengeDoc.exists) {
      console.warn(`Authentication challenge document not found: ${challengeId}`);
      throw new functions.https.HttpsError("not-found", "Authentication challenge not found or expired. Please try again.");
    }

    const challengeData = challengeDoc.data();
    expectedChallenge = challengeData?.challenge;
    const expiresAt = challengeData?.expiresAt as admin.firestore.Timestamp | undefined;

    // Check expiry (redundant if TTL is working, but good defense-in-depth)
    if (!expectedChallenge || !expiresAt || expiresAt.toMillis() < Date.now()) {
      console.warn(`Authentication challenge expired or invalid: ${challengeId}`);
      // Attempt to delete the invalid/expired doc before throwing
      await challengeDocRef.delete().catch(err => console.error("Error deleting invalid/expired challenge:", err));
      throw new functions.https.HttpsError("deadline-exceeded", "Authentication challenge expired or invalid. Please try again.");
    }

    // Challenge is valid and retrieved
    console.log(`Retrieved valid auth challenge ${challengeId}`);

  } catch (error: any) {
    // If the error is one we threw intentionally, re-throw it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    // Otherwise, log and throw a generic internal error
    console.error(`Unexpected error retrieving challenge ${challengeId}:`, error);
    throw new functions.https.HttpsError("internal", "Failed to retrieve authentication challenge.");
  } finally {
    // 2. **Crucially: Delete the challenge document immediately after retrieval attempt**
    // This prevents reuse, even if subsequent verification steps fail.
    if (challengeDoc! && challengeDoc.exists) { // Check if challengeDoc was successfully fetched
      await challengeDocRef.delete().catch(err => {
        // Log failure but don't necessarily block authentication
        console.error(`Non-critical: Failed to delete used auth challenge ${challengeId}:`, err);
      });
      console.log(`Deleted used auth challenge ${challengeId}`);
    }
  }

  // --- Verification Steps (using the retrieved expectedChallenge) ---
    
  // 3. Determine User ID - prioritize userHandle from response
  const userIdFromHandle = authResponse.response.userHandle;
  if (!userIdFromHandle) {
    console.error("User handle (userId) missing from authenticator response.");
    throw new functions.https.HttpsError("invalid-argument", "User handle missing from authenticator response.");
  }
  const userId = userIdFromHandle; // Use the handle from the response
  console.log(`Attempting verification for user ${userId} using challenge ${challengeId}`);
    
  // 4. Get the Stored Credential based on Credential ID from the response
  const credentialIDBase64URL = authResponse.id; // This IS the ID to use for lookup
  let storedCredential: StoredCredential;
  try {
    const credDocRef = db.collection("users").doc(userId).collection("passkeys").doc(credentialIDBase64URL);
    const credDoc = await credDocRef.get();
    if (!credDoc.exists) {
      console.warn(`Authenticator ${credentialIDBase64URL} not found for user ${userId}.`);
      throw new functions.https.HttpsError("not-found", "Authenticator not registered for this user.");
    }
    storedCredential = credDoc.data() as StoredCredential;
  } catch(error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error(`Error fetching authenticator ${credentialIDBase64URL} for user ${userId}:`, error);
    throw new functions.https.HttpsError("internal", "Failed to retrieve authenticator data.");
  }

  // Ensure public key is Buffer for verification library
  const publicKeyBuffer = Buffer.from(storedCredential.publicKey, "base64");

  // 5. Verify the Authentication Response
  let verification: VerifiedAuthenticationResponse;
  try {
    const opts: VerifyAuthenticationResponseOpts = {
      response: authResponse, // Use the authResponse from payload
      expectedChallenge: expectedChallenge, // Use the securely retrieved challenge
      expectedOrigin: expectedOrigins, 
      expectedRPID: rpID,
      authenticator: {
        // Provide required fields in correct format
        credentialID: storedCredential.credentialID, // Should be base64url string matching the doc ID
        credentialPublicKey: publicKeyBuffer,
        counter: storedCredential.counter,
        // Optional: Pass transports if they were stored and needed
        // transports: storedCredential.transports,
      },
      requireUserVerification: false, // Set to true if you want to enforce UV (PIN, biometrics)
    };
    verification = await verifyAuthenticationResponse(opts);
    console.log(`Verification successful for user ${userId}, credential ${credentialIDBase64URL}`);

  } catch (error: any) {
    console.error(`Authentication verification failed for user ${userId}, credential ${credentialIDBase64URL}:`, error);
    // Consider specific error handling, e.g., for counter mismatch
    // If counter is simply too low, potentially update stored counter?
    // await db.collection('users').doc(userId).collection('passkeys').doc(credentialIDBase64URL).update({ counter: error.expectedCounter });
    throw new functions.https.HttpsError("unauthenticated", `Authentication verification failed: ${error.message}`);
  }
        
  // 6. Post-Verification Steps
  if (verification.verified) {
    // Update the counter in Firestore
    try {
      await updateCredentialCounter(userId, credentialIDBase64URL, verification.authenticationInfo.newCounter);
      console.log(`Updated counter for credential ${credentialIDBase64URL} to ${verification.authenticationInfo.newCounter}`);
    } catch (error) {
      console.error(`Failed to update counter for credential ${credentialIDBase64URL}:`, error);
      // Log error but proceed with login if verification itself passed
    }

    // Generate a custom Firebase Auth token
    try {
      const customToken = await admin.auth().createCustomToken(userId);
      console.log(`Generated custom token for user ${userId}`);
      return { verified: true, customToken: customToken };
    } catch (error) {
      console.error(`Failed to create custom token for user ${userId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to create custom login token.");
    }
  } else {
    // Should not happen if verifyAuthenticationResponse didn't throw, but check anyway
    console.error(`Verification result was false for user ${userId}, credential ${credentialIDBase64URL}`);
    throw new functions.https.HttpsError("unauthenticated", "Passkey authentication failed verification.");
  }
}); 