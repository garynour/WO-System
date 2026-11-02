var e=`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Identity = phone number extracted from "<phone>@wo.app" or "<phone>@wo.factory"
    function isSignedIn() {
      return request.auth != null && request.auth.token.email != null;
    }

    function myPhone() {
      return request.auth.token.email.split('@')[0];
    }

    function userOk() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(myPhone()));
    }

    function isAdmin() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(myPhone()));
    }

    // Owner = admin document created from Firebase Console without 'by' field (or empty 'by')
    function isOwner() {
      return isAdmin() && (
        !('by' in get(/databases/$(database)/documents/admins/$(myPhone())).data)
        || get(/databases/$(database)/documents/admins/$(myPhone())).data.by == ''
        || get(/databases/$(database)/documents/admins/$(myPhone())).data.by == null
      );
    }

    function hasCfg() {
      return exists(/databases/$(database)/documents/roles/map);
    }

    function rolesData() {
      return get(/databases/$(database)/documents/roles/map).data;
    }

    function myDepts() {
      return hasCfg() && ('assign' in rolesData()) && (myPhone() in rolesData().assign)
        ? rolesData().assign[myPhone()]
        : [];
    }

    function mySigs() {
      return hasCfg() && ('sigs' in rolesData()) && (myPhone() in rolesData().sigs)
        ? rolesData().sigs[myPhone()]
        : [];
    }

    function hasSigRole() {
      return mySigs().size() > 0;
    }

    // Working hours: Sat-Thu 08:00-17:00 Cairo (05:00-15:00 UTC), closed Friday; Admins/Owner exempt
    function dayNum() {
      return (math.floor(request.time.toMillis() / 86400000) + 4) % 7;
    }

    function inHours() {
      return dayNum() != 5 && request.time.hours() >= 5 && request.time.hours() < 15;
    }

    function isMember() {
      return isAdmin() || (
        userOk() && inHours() && hasCfg() && (
          myPhone() in rolesData().get('assign', {}).keys() ||
          myPhone() in rolesData().get('sigs', {}).keys()
        )
      );
    }

    function hasDept(deptKey) {
      return isAdmin() || (isMember() && deptKey in myDepts());
    }

    // Invites & Pending activations (backward-compatible with both /invites and /pending)
    match /invites/{id} {
      allow read, write: if isAdmin();
    }

    match /pending/{phone} {
      allow get: if true;
      allow list: if isAdmin();
      allow create, update: if isAdmin();
      allow delete: if isAdmin() || (isSignedIn() && myPhone() == phone);
    }

    // Active users
    match /users/{phone} {
      allow get: if isSignedIn() && (myPhone() == phone || isAdmin());
      allow list: if isAdmin();
      allow create, update: if isAdmin() || (
        isSignedIn() && myPhone() == phone && (
          !exists(/databases/$(database)/documents/invites/$(phone))
          || get(/databases/$(database)/documents/invites/$(phone)).data.code == request.resource.data.code
        )
      );
      allow delete: if isAdmin();
    }

    // Admins registry
    match /admins/{phone} {
      allow read: if isSignedIn() && (myPhone() == phone || isAdmin());
      allow create: if (isOwner() && phone != myPhone() && request.resource.data.by == myPhone())
        || (isSignedIn() && myPhone() == phone && !exists(/databases/$(database)/documents/config/bootstrapped));
      allow update, delete: if isOwner() && phone != myPhone();
    }

    // Department & signature role assignments
    match /roles/{docId} {
      allow read: if userOk() || isAdmin();
      allow write: if isAdmin();
    }

    // User profile photos & metadata
    match /profiles/{phone} {
      allow read: if userOk() || isAdmin();
      allow write: if isAdmin() || (isSignedIn() && myPhone() == phone);
    }

    // System & factory config (geofence, late threshold, productivity thresholds)
    match /config/{docId} {
      allow read: if userOk() || isAdmin();
      allow write: if isAdmin()
        || (docId == 'productivity' && hasDept('PLANNING'))
        || (docId == 'bootstrapped' && isSignedIn() && !exists(/databases/$(database)/documents/config/bootstrapped));
    }

    // Editable lookup lists & one-time season plan seed markers (admin only)
    match /settings/{docId} {
      allow read, write: if isAdmin();
    }

    // Global PO uniqueness index (/poIndex/{normalizedPo})
    match /poIndex/{poKey} {
      allow read, write: if isAdmin() || hasDept('PLANNING');
    }

    // Work Orders & Season Plan unified collection (strict role isolation + fast list validation)
    match /orders/{orderId} {
      allow list: if isAdmin()
        || hasSigRole()
        || (
          isMember()
          && resource.data.status == 'in_progress'
          && resource.data.stage in myDepts()
        );

      allow get: if isAdmin()
        || hasSigRole()
        || (
          isMember()
          && resource.data.get('status', 'in_progress') == 'in_progress'
          && (
            !('stage' in resource.data)
            || resource.data.stage == null
            || (resource.data.stage in myDepts())
            || (myPhone() in resource.data.get('assignedTo', []))
          )
        );

      allow create: if isAdmin() || hasDept('PLANNING');

      allow update: if isAdmin()
        || hasDept('PLANNING')
        || (
          isMember()
          && resource.data.get('status', 'in_progress') == 'in_progress'
          && (
            !('stage' in resource.data)
            || resource.data.stage == null
            || (resource.data.stage in myDepts())
            || hasSigRole()
          )
          && request.resource.data.get('pos', resource.data.get('pos', [])) == resource.data.get('pos', [])
          && request.resource.data.get('po', resource.data.get('po', '')) == resource.data.get('po', '')
        );

      allow delete: if isAdmin();

      // Per-order change & undo audit history (admin only)
      match /history/{historyId} {
        allow read, write: if isAdmin();
      }
    }

    // Detailed stage data documents
    match /stages/{stageDocId} {
      allow read: if isAdmin() || isMember();
      allow create, update: if isAdmin() || isMember();
      allow delete: if isAdmin();
    }

    // Productivity targets, bonuses, and automatic monthly snapshots
    match /line_targets/{targetId} {
      allow read: if isAdmin() || isMember();
      allow write: if isAdmin() || hasDept('PLANNING');
    }

    match /line_bonuses/{bonusId} {
      allow read: if isAdmin() || isMember();
      allow write: if isAdmin() || hasDept('PLANNING');
    }

    match /monthly_snapshots/{monthId} {
      allow read: if isAdmin() || isMember();
      allow create, update: if isAdmin() || isMember();
      allow delete: if isAdmin();
    }

    // Safe Productivity Resets & Previous-Period Snapshots (admin only)
    match /productivityResets/{resetId} {
      allow read, write: if isAdmin();
    }

    match /productivitySnapshots/{snapId} {
      allow read, write: if isAdmin();
    }

    // Department notifications
    match /notifs/{notifId} {
      allow read: if isAdmin() || (isMember() && resource.data.dept in myDepts());
      allow create: if isAdmin() || isMember();
      allow update: if isAdmin();
      allow delete: if isAdmin() || (isMember() && resource.data.dept in myDepts());
    }

    // Account screenshots
    match /shots/{shotId} {
      allow read: if isAdmin() || hasDept('ACCOUNT') || (isMember() && resource.data.byId == myPhone());
      allow create: if isAdmin() || isMember();
      allow update: if isAdmin() || hasDept('ACCOUNT');
      allow delete: if isAdmin() || hasDept('ACCOUNT');
    }
  }
}
`,t=`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() {
      return request.auth != null && request.auth.token.email != null;
    }

    function myPhone() {
      return request.auth.token.email.split('@')[0];
    }

    function isAdmin() {
      return isSignedIn()
        && firestore.exists(/databases/(default)/documents/admins/$(myPhone()));
    }

    match /model-images/{imageFile} {
      allow read: if isSignedIn();
      allow write: if isAdmin()
        && request.resource.size < 6 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
`,n=`{
  "indexes": [
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "stage", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "season", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "style", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "notifs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "dept", "order": "ASCENDING" },
        { "fieldPath": "at", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
`;function r(e,t){let n=URL.createObjectURL(e),r=document.createElement(`a`);r.href=n,r.download=t,r.rel=`noopener`,document.body.appendChild(r),r.click(),setTimeout(()=>{document.body.removeChild(r),URL.revokeObjectURL(n)},500)}function i(e,t,n){r(new Blob([e],{type:n}),t)}async function a(e,t,n,a=`text/plain;charset=utf-8`){try{let n=await fetch(e,{cache:`no-cache`});if(n.ok){r(await n.blob(),t);return}}catch{}n!==void 0&&i(n,t,a)}function o(){a(`./downloads/UPLOAD-TO-GITHUB.zip`,`UPLOAD-TO-GITHUB.zip`)}function s(){a(`./downloads/factory-orders-FULL.zip`,`factory-orders-FULL.zip`)}function c(){a(`./downloads/index.html`,`index.html`)}function l(){a(`./downloads/sw.js`,`sw.js`)}function u(){a(`./manifest.webmanifest`,`manifest.webmanifest`)}function d(){a(`./downloads/firestore.rules`,`firestore.rules`,e,`text/plain;charset=utf-8`)}function f(){a(`./downloads/storage.rules`,`storage.rules`,t,`text/plain;charset=utf-8`)}function p(){a(`./downloads/firestore.indexes.json`,`firestore.indexes.json`,n,`application/json;charset=utf-8`)}export{n as FIRESTORE_INDEXES_JSON,e as FIRESTORE_RULES_TXT,t as STORAGE_RULES_TXT,p as downloadFirestoreIndexesFile,d as downloadFirestoreRulesFile,s as downloadFullProjectZip,o as downloadGithubZip,c as downloadStandaloneIndexHtml,u as downloadStandaloneManifest,l as downloadStandaloneSwJs,f as downloadStorageRulesFile};