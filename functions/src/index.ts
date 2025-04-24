/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as admin from "firebase-admin";

// Initialize Admin SDK **ONCE** here
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Import WebAuthn functions
import {
  webauthnGenerateRegistrationOptions,
  webauthnVerifyRegistration,
  webauthnGenerateAuthenticationOptions,
  webauthnVerifyAuthentication
} from "./webauthn";

// Export WebAuthn functions
export {
  webauthnGenerateRegistrationOptions,
  webauthnVerifyRegistration,
  webauthnGenerateAuthenticationOptions,
  webauthnVerifyAuthentication
}; 

// Time Tracking System Cloud Functions
// Currently no functions are implemented

// Example function (commented out)
// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
