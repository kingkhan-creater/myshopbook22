# Firestore Architecture for a Future Chat System in ShopBook Pro

This document outlines the proposed Firestore data structure, security rules, and indexing strategy for a scalable and secure chat system. This is a planning document and does not represent a live implementation.

---

## 1. Firestore Data Structure

The architecture consists of three main parts: `friendships`, `chats`, and a `messages` subcollection.

### a. `friendships` Collection

This collection manages the relationships between users, ensuring only friends can initiate a chat.

- **Path**: `/friendships/{friendshipId}`
- **Document ID (`friendshipId`)**: A composite ID created by combining the two user UIDs, sorted alphabetically to prevent duplicates (e.g., `uid1_uid2`).
- **Fields**:
  - `userIds`: `array` of two strings (e.g., `['user_abc', 'user_xyz']`)
  - `status`: `string` (e.g., `'pending'`, `'accepted'`, `'declined'`, `'blocked'`)
  - `requestedBy`: `string` (The UID of the user who sent the request)
  - `createdAt`: `timestamp`
  - `updatedAt`: `timestamp`

### b. `chats` Collection

This collection stores metadata for each private conversation.

- **Path**: `/chats/{chatId}`
- **Document ID (`chatId`)**: A composite ID, similar to `friendshipId`, created from the two user UIDs sorted alphabetically. This is the key to preventing duplicate chat rooms.
- **Fields**:
  - `userIds`: `array` of two strings (e.g., `['user_abc', 'user_xyz']`)
  - `lastMessage`: `map` (An object containing a preview of the most recent message, e.g., `{ text: 'See you then!', senderId: 'user_abc', timestamp: ... }`)
  - `createdAt`: `timestamp`
  - `updatedAt`: `timestamp`
  - `userReadStatus`: `map` (Tracks read receipts for each user, e.g., `{ 'user_abc': <timestamp>, 'user_xyz': <timestamp> }`)

### c. `messages` Subcollection

This subcollection is nested within each chat document and contains the actual messages for that conversation.

- **Path**: `/chats/{chatId}/messages/{messageId}`
- **Document ID (`messageId`)**: A unique, auto-generated ID from Firestore.
- **Fields**:
  - `text`: `string` (The content of the message)
  - `senderId`: `string` (The UID of the user who sent the message)
  - `timestamp`: `timestamp`
  - `mediaUrl`: `string` (Optional, for future use with images/videos)

---

## 2. Design Rationale

### Why use a Subcollection for Messages?

- **Scalability**: A single chat can contain thousands of messages. By placing them in a subcollection, we keep the parent `chat` document lightweight. This allows us to efficiently query a user's list of conversations without fetching every single message from all conversations.
- **Performance**: Fetching messages for a specific chat is much faster as we only query within that subcollection. It also makes pagination (loading messages in chunks) simple and efficient.
- **Cost**: Firestore billing is based on document reads. This structure prevents us from reading thousands of message documents just to display a chat list.

### How `chatId` is Generated and Prevents Duplicates

To prevent multiple chat rooms between the same two users, we use a deterministic `chatId`.
1.  Take the UIDs of the two users in the chat (e.g., `user_A` and `user_B`).
2.  Sort them alphabetically: `['user_A', 'user_B']`.
3.  Join them with an underscore: `'user_A_user_B'`.

The client application will always generate the `chatId` this way. Before creating a new chat, it checks if a document with this ID already exists. If it does, it opens the existing chat; otherwise, it creates a new one. This guarantees a unique conversation room for any pair of users.

---

## 3. Security & Indexing

### Firestore Security Rules

These rules ensure that data access is strictly limited to the participants of a friendship or chat.

```rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // --- Existing User Profile Rules ---
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // --- Chat System Rules ---

    // Friendships: Users in the `userIds` array can read. Creation and updates
    // are also restricted to participants.
    match /friendships/{friendshipId} {
      allow read, update: if request.auth.uid in resource.data.userIds;
      allow create: if request.auth.uid in request.resource.data.userIds;
      allow delete: if false; // Deleting friendships might be a "block" or "unfriend" action, handled via update.
    }

    // Chat Metadata: Only chat participants can access the chat document.
    match /chats/{chatId} {
      allow read, create, update: if request.auth.uid in resource.data.userIds;
    }

    // Messages: Only chat participants can read messages. A user can only create a
    // message as themselves. Messages are immutable (cannot be updated or deleted).
    match /chats/{chatId}/messages/{messageId} {
      allow read: if get(/databases/$(database)/documents/chats/$(chatId)).data.userIds.hasAny([request.auth.uid]);
      allow create: if request.auth.uid == request.resource.data.senderId
                    && get(/databases/$(database)/documents/chats/$(chatId)).data.userIds.hasAny([request.auth.uid]);
      allow update, delete: if false; // Ensures message history is preserved.
    }
  }
}
```

### Required Firestore Indexes

To ensure queries remain fast at scale, the following composite indexes will be required. These should be created in the Firebase Console.

1.  **For `friendships` Collection**: To find a user's friends or friend requests.
    - **Fields**: `userIds` (Array), `status` (Ascending)
    - **Query Scope**: Collection

2.  **For `chats` Collection**: To fetch a user's list of chats, sorted by recent activity.
    - **Fields**: `userIds` (Array), `updatedAt` (Descending)
    - **Query Scope**: Collection

No composite indexes are required for the `messages` subcollection for basic functionality, as Firestore automatically indexes single fields. Querying by `timestamp` will be efficient out-of-the-box.
