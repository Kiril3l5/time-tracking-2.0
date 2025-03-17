# Firebase Configuration

## Firestore Rules

The Firestore security rules for this project are maintained in a single location at the project root:

- `[root]/firestore.rules`

This is the only version of the rules that should be edited and is the version that will be deployed via Firebase CLI.

The path to the rules file is specified in `firebase.json` at the project root.

## Making Changes to Rules

When making changes to Firestore security rules:

1. Edit only the `firestore.rules` file at the project root
2. Test changes using the Firebase emulator
3. Deploy changes using:
   ```
   pnpm run deploy:rules
   ```

This approach ensures a single source of truth for security rules and avoids confusion from multiple copies of the same rules. 