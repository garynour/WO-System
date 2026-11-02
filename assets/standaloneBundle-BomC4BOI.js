var e=`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null && request.auth.token.email != null;
    }

    function myPhone() {
      return request.auth.token.email.split('@')[0];
    }

    function isOwner() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(myPhone()))
        && !('by' in get(/databases/$(database)/documents/admins/$(myPhone())).data);
    }

    function isAdmin() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(myPhone()));
    }

    function isMember() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(myPhone()));
    }

    function rolesData() {
      return get(/databases/$(database)/documents/roles/map).data;
    }

    function myDepts() {
      return ('assign' in rolesData() && myPhone() in rolesData().assign)
        ? rolesData().assign[myPhone()]
        : [];
    }

    function hasSigRole() {
      return ('sigs' in rolesData() && myPhone() in rolesData().sigs)
        ? rolesData().sigs[myPhone()].size() > 0
        : false;
    }

    function hasDept(deptKey) {
      return isAdmin() || (isMember() && deptKey in myDepts());
    }

    function canReadOrderData(orderData) {
      return isAdmin()
        || isOwner()
        || (
          isMember()
          && orderData.get('status', 'in_progress') == 'in_progress'
          && (
            (orderData.get('stage', '') in myDepts())
            || (myPhone() in orderData.get('assignedTo', []))
            || hasSigRole()
          )
        );
    }

    match /pending/{phone} {
      allow get: if true;
      allow list: if isAdmin();
      allow create, update: if isAdmin();
      allow delete: if isAdmin() || (isSignedIn() && myPhone() == phone);
    }

    match /users/{phone} {
      allow get: if isSignedIn() && (myPhone() == phone || isAdmin());
      allow list: if isAdmin();
      allow create: if isAdmin() || (isSignedIn() && myPhone() == phone);
      allow update, delete: if isAdmin();
    }

    match /admins/{phone} {
      allow get: if isSignedIn();
      allow list: if isSignedIn();
      allow create: if isOwner()
        || (isSignedIn() && myPhone() == phone && !exists(/databases/$(database)/documents/config/bootstrapped));
      allow update, delete: if isOwner();
    }

    match /roles/{docId} {
      allow read: if isMember() || isAdmin();
      allow write: if isAdmin();
    }

    match /profiles/{phone} {
      allow read: if isMember() || isAdmin();
      allow write: if isAdmin() || (isSignedIn() && myPhone() == phone);
    }

    match /config/{docId} {
      allow read: if isMember() || isAdmin();
      allow write: if isAdmin()
        || (docId == 'bootstrapped' && isSignedIn() && !exists(/databases/$(database)/documents/config/bootstrapped));
    }

    match /settings/{docId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    match /poIndex/{poKey} {
      allow read: if isAdmin() || hasDept('PLANNING');
      allow write: if isAdmin() || hasDept('PLANNING');
    }

    match /orders/{orderId} {
      allow read: if canReadOrderData(resource.data);
      allow create: if isAdmin() || hasDept('PLANNING');
      allow update: if isAdmin()
        || hasDept('PLANNING')
        || (
          isMember()
          && canReadOrderData(resource.data)
          && request.resource.data.get('pos', resource.data.get('pos', [])) == resource.data.get('pos', [])
          && request.resource.data.get('po', resource.data.get('po', '')) == resource.data.get('po', '')
        );
      allow delete: if isAdmin() || isOwner();

      match /history/{historyId} {
        allow read, write: if isAdmin() || isOwner();
      }
    }

    match /stages/{stageDocId} {
      allow read: if isAdmin() || isMember();
      allow create, update: if isAdmin() || isMember();
      allow delete: if isAdmin() || isOwner();
    }

    match /line_targets/{targetId} {
      allow read: if isAdmin() || hasDept('PLANNING') || hasDept('SEWING') || hasDept('CUTTING') || hasDept('PRINTING') || hasSigRole();
      allow write: if isAdmin() || isOwner() || hasDept('PLANNING');
    }

    match /line_bonuses/{bonusId} {
      allow read: if isAdmin() || hasDept('PLANNING') || hasDept('SEWING') || hasDept('CUTTING') || hasDept('PRINTING') || hasSigRole();
      allow write: if isAdmin() || isOwner() || hasDept('PLANNING');
    }

    match /monthly_snapshots/{monthId} {
      allow read: if isAdmin();
      allow create, update: if isAdmin() || isMember();
      allow delete: if isAdmin() || isOwner();
    }

    match /productivityResets/{resetId} {
      allow read, write: if isAdmin() || isOwner();
    }

    match /productivitySnapshots/{snapId} {
      allow read, write: if isAdmin() || isOwner();
    }

    match /notifs/{notifId} {
      allow read: if isAdmin() || (isMember() && resource.data.dept in myDepts());
      allow create: if isAdmin() || isMember();
      allow update: if isAdmin();
      allow delete: if isAdmin()
        || isOwner()
        || (isMember() && resource.data.dept in myDepts());
    }

    match /shots/{shotId} {
      allow read: if isAdmin() || hasDept('ACCOUNT');
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