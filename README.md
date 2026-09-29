# 🔒 Scanner Vault

**Scanner Vault** is a lightweight, web-based digital document management platform for securely storing, organizing, and retrieving personal documents — PDFs, images, and scanned receipts — all in one place.

Built as a minor project, it demonstrates full-stack web development fundamentals (CRUD operations, file handling, authentication, and data retrieval) along with the practical application of core **Data Structures & Algorithms** to keep search and retrieval fast as the document count grows.

---

## ✨ Features

- **Create Account & Login** — secure signup/login flow with salted, hashed passwords (Web Crypto SHA-256)
- **Document Upload** — drag-and-drop or click-to-upload for PDFs and images
- **Categorization & Tagging** — organize documents under categories (Tax, Medical, Academic, Receipts, Other) with custom tags
- **Instant Search** — search by title, tag, or date with live autocomplete suggestions
- **Document Preview** — view images and PDFs directly in-browser before downloading
- **Edit & Delete** — update document metadata or remove documents at any time
- **Storage Dashboard** — live stats on document count, categories, tags, and storage used
- **Fully Responsive** — clean, professional white-themed UI that works on desktop and mobile

---

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Storage    | Browser `localStorage` (client-side, no backend required) |
| Security   | Web Crypto API (SHA-256 password hashing with per-user salt) |

No frameworks, no build step, no dependencies — open `index.html` and it runs.

---

## 🧠 Data Structures & Algorithms Applied

Despite being a simple client-side project, Scanner Vault implements real data structures to optimize search and retrieval rather than relying on brute-force loops:

| Data Structure | Application | Benefit |
|---|---|---|
| **Hash Map** (`Map`) | Tag indexing — maps each tag → set of document IDs | O(1) constant-time filtering of documents by tag/category |
| **Trie (Prefix Tree)** | Powers the search bar's autocomplete | Instant prefix-based suggestions as the user types, without rescanning the full document list |
| **B-Trees / Indexing** *(conceptual — production DB layer)* | Metadata lookups by upload date or owner ID | Keeps lookups and range queries fast even as data scales into millions of records |

---

## 📂 Project Structure

```
scanner-vault/
├── index.html    # App markup — auth screens, dashboard, modals
├── style.css     # Styling — white/professional UI, responsive layout
├── app.js        # App logic — auth, CRUD, Trie search, hash-map tag index
└── README.md
```

---

## 🚀 Getting Started

No installation or server required.

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/scanner-vault.git
   cd scanner-vault
   ```
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox).
3. Create an account, log in, and start uploading documents.

> **Note:** All three files (`index.html`, `style.css`, `app.js`) must stay in the same folder — the page loads blank if they're separated.

---

## ⚠️ Limitations

- Data is stored in the browser's `localStorage`, so it is **per-browser, per-device** — it does not sync across devices and is cleared if browser storage is cleared.
- `localStorage` has a practical ceiling of ~5 MB, so individual file uploads are capped at 1.5 MB.
- Password hashing runs entirely client-side, which is appropriate for a demo/minor project but **not a substitute for real backend authentication** in a production system.

---

## 🔮 Future Scope

- Add a backend (Node.js/Express or Python/FastAPI) with a real database (SQLite/MongoDB) for persistent, multi-device storage
- Implement OCR (e.g., Tesseract.js) to make text *inside* scanned images/PDFs searchable
- Add end-to-end encryption for uploaded files
- Support cloud storage integration (e.g., AWS S3, Google Drive API)

---

## 📄 License

This project is open-source and available for educational use.
