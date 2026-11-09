# Inspection team access

Firestore and Storage now require a Firebase Auth token with the boolean custom
claim `assetInspector: true`. This is a shared inspection-team role: approved
inspectors can read and edit the team's portfolio, assets, presence and photos.
It is not tenant isolation or a per-site ownership model.

Anonymous authentication by itself does not grant access. An administrator must
approve each legitimate Firebase Auth UID. The simulated inspector profile in
localStorage is not an authentication identity and cannot grant permissions.

## Before deploying rules

1. Identify legitimate users' UIDs in Firebase Authentication. The app currently
   uses anonymous authentication; clearing browser storage or using another
   browser can create a new UID, which needs separate approval. For production
   account recovery and device sharing, use persistent organizational sign-in.
2. In a trusted server/admin environment with the Firebase Admin SDK and
   Application Default Credentials for the correct project, preserve existing
   claims and add the inspector role:

   ```js
   const user = await getAuth().getUser(approvedUid);
   await getAuth().setCustomUserClaims(approvedUid, {
     ...user.customClaims,
     assetInspector: true,
   });
   ```

   Never ship Admin SDK credentials or this grant operation in the browser.
3. Reload the app to refresh the signed-in user's ID token. Deploy both
   `firestore.rules` and `storage.rules` to the intended Firebase project and
   Firestore database (the app can use a named database). The test configuration
   below is for emulators only; do not use it to deploy production rules.
4. Verify an approved user can sync, and an unapproved user cannot read or write.
   Without the claim, edits remain local/queued instead of being marked synced.

Existing documents do not require owner-field migration. Rules do not revoke
previously issued Storage download-token URLs or copies already downloaded while
access was public. Rotate previously exposed download tokens through a trusted
admin workflow if revocation is needed; update stored photo URLs accordingly.

## Local verification

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:rules
```

The rules suite uses only the `demo-asset-inspector` project and local Firestore /
Storage emulators, never the configured production project. It requires Java 17+
and downloads the pinned Firebase CLI on first run. Ordinary unit tests skip
emulator tests when the emulator environment variables are absent.
