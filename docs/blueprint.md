# **App Name**: ShopBookPro

## Core Features:

- Firebase Authentication: Implements Firebase Authentication using Email/Password to securely manage user accounts within the new Firebase project.
- Firestore User Profile Creation: Automatically saves user profile data to Firestore upon successful signup, storing user details under a unique user ID (UID) and preventing duplicate document creation.
- Firestore Data Retrieval: Retrieves the user document from Firestore based on the current user's UID to display a personalized welcome message on the dashboard.
- Dashboard UI: Displays the welcome message, incorporating the user's full name fetched from Firestore to provide a personalized user experience.

## Style Guidelines:

- Primary color: Dark blue (#3F51B5) to convey trust and stability.
- Background color: Light gray (#F5F5F5) for a clean and professional look.
- Accent color: Orange (#FF9800) to highlight important actions and calls to action.
- Font pairing: 'Inter' (sans-serif) for both headlines and body text. It has a modern, machined, objective, neutral look.
- Use minimalist icons to represent various financial transactions and categories.
- Clean and organized layout with clear sections for balance overview, transactions, and settings.
- Subtle transition animations to enhance user experience when navigating between dashboard sections.