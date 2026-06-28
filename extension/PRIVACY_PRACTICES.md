# Chrome Web Store — Privacy Practices

Copy each section into the matching field of **Developer Dashboard → Privacy practices**.
English is required by the review process.

## Single purpose

Bookmarker saves the page the user is currently viewing and organizes it with
AI-generated tags so it can later be found through natural-language search. The
extension does one thing: capture the active tab (on an explicit user action)
and send it to the user's own Bookmarker account.

## Permission justifications

- **activeTab** — Reads the URL, title, and visible text of the current tab
  only when the user clicks "Save" or presses the save shortcut. No background
  or passive tab access.
- **storage** — Stores the user's Supabase authentication session
  (`chrome.storage.local`) so the user stays signed in between sessions.
- **scripting** — Injects a content script on the active tab, on user action,
  to read the page text used for AI tagging.
- **Host permissions** (`localhost`, `*.vercel.app`) — Sends the saved
  bookmark to the Bookmarker web app's API. Limited to the app's own origins.

## Data collected and how it is used

| Data | Purpose | Stored? |
| --- | --- | --- |
| Current tab URL | Saved as the bookmark | Yes (user's account) |
| Current tab title | Saved as the bookmark | Yes (user's account) |
| Page text content | AI tagging and embedding only | **No — discarded immediately after processing** |
| Auth session token | Keep the user signed in | `chrome.storage.local` only |

## Third-party disclosures

Saved data is processed by:

- **OpenAI** — generates tags and the search embedding. Page content is sent
  for processing only and is **not used for model training** and **not stored**.
- **Supabase** — stores the user's bookmarks (URL, title, tags, embedding).

The authentication token is never shared with any third party. It is used only
to authenticate requests to the user's own Bookmarker account.

## Data retention and deletion

- Page **content is never persisted** — it is discarded as soon as AI
  processing completes.
- On sign-out or account deletion, the local session and cache are fully
  cleared (`chrome.storage.local.clear()`).
- Account deletion removes all of the user's bookmarks from the database.

## Required certifications

- [x] I do not sell or transfer user data to third parties outside of the
      approved use cases above.
- [x] I do not use or transfer user data for purposes unrelated to the item's
      single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for
      lending purposes.
