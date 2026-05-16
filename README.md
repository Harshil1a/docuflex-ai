# DocuFlex AI 🪄
### The Ultimate Intelligent Document Command Center

DocuFlex AI is a high-performance, premium SaaS platform that transforms static documents into interactive, AI-enhanced assets. Built with a modular **"Sidebar + Main Theater"** architecture, it provides a distraction-free, professional environment for document processing, AI analysis, and autonomous workflows.

---

## 📂 The Architecture Map (Folder Breakdown)

The project is organized into a robust monorepo structure, ensuring a clean separation between the "Brain" and the "Interface":

1.  **`backend/` (The Brain)**: 
    *   Powered by **Spring Boot 3.4** and **Java 21**.
    *   **Package Structure**:
        *   `api`: **The Gateway** (REST Controllers for all AI & Document requests).
        *   `service`: **The Engine** (AI Logic, OCR processing, and Conversion).
        *   `security`: **The Guard** (JWT authentication & RBAC authorization).
        *   `domain & model`: **The Blueprints** (Data structure for Docs and Users).
        *   `repo & repository`: **The Librarians** (MongoDB database connectivity).
        *   `config`: **The Settings** (System-wide security and storage config).
    *   Contains the **AiService**, which orchestrates requests to Groq/Gemini for intent parsing and content generation.
2.  **`frontend/` (The Interface)**:
    *   Built with **React 19**, **Vite**, and **TypeScript**.
    *   Uses a custom-crafted CSS system for **Premium Aesthetics** (Gradients, Glassmorphism, and Dark Mode).
    *   Implements the **Magic Command Bar** and the **Modular Grid** layout.
3.  **`infrastructure/` (The Foundation)**:
    *   Includes **Docker Compose** configurations for seamless local MongoDB orchestration.
    *   Ensures consistent development environments across teams.
4.  **`uploads/` (The Vault)**:
    *   A structured storage system that maintains file integrity and supports the secure blob-based download system.
5.  **`scripts/` (The Automation)**:
    *   Contains helper scripts like `run-backend.ps1` to streamline the development lifecycle and automate environment checks.

---

## ✨ The "Magic Five" Core Features

We didn't just build a document manager; we built an autonomous assistant. Here are the five pillar features:

### 1. Magic AI Command Center (AI Intent Parsing) 🧠
The centerpiece of the platform. Instead of simple keyword matching, we use **AI Intent Parsing**. When you type a command, the system uses Groq/Gemini to "understand" your request and map it to system functions like `CONVERT`, `SUMMARIZE`, or `OPTIMIZE`.

### 2. Smart Optimization & Conversion 📄
A sophisticated engine that allows for **Bulk Conversion** and **File Optimization**. It supports:
*   **Compression**: Reducing file size for web storage.
*   **Resizing**: Scaling images within documents for efficiency.
*   **Format Shifting**: Seamlessly moving between PDF, DOCX, and TXT.

### 3. Vision-Powered OCR (Llama 3.2 Vision) 👁️
DocuFlex AI can "see". We integrated the latest **Vision Models** to perform high-accuracy OCR on images (PNG, JPG, WEBP), allowing you to chat with screenshots and scanned documents as if they were text.

### 4. Autonomous Workflows 🪄
Our "One Command" logic. You can ask the AI to *"Summarize and download this as a PDF,"* and the system will autonomously chain multiple backend tasks (Extract -> Summarize -> Convert -> Export) and trigger a secure download in one go.

### 5. Enterprise-Grade RBAC & Security 👑
A robust Role-Based Access Control system. It features:
*   **First-User Admin Policy**: The first registered user automatically becomes the Master Admin.
*   **Secret Key Registration**: Subsequent admins require a secure `ADMIN_REGISTRATION_KEY`.
*   **Admin Portal**: A dedicated UI for monitoring system stats, user storage, and revoking access.

---

## 🏗️ How We Achieved the Impossible

1.  **AI Orchestration**: We built a custom bridge between the Java backend and AI providers, allowing for structured JSON responses from natural language.
2.  **Secure Blob Distribution**: To fix common browser download errors, we implemented a **Secure Blob Fetch** system that passes Authorization tokens directly into file streams.
3.  **Modular UI Design**: Using a persistent Magic Action Bar, we ensure that AI features are always "One Click" or "One Command" away, regardless of where you are in the document.

---

## 🚀 Getting Started

1.  **Clone & Install**: `npm install`
2.  **Environment**: Set your `GROQ_API_KEY` and `MONGODB_URI` in `.env`.
3.  **Run**: `npm run dev`

---
*Developed with excellence by the Antigravity AI Team.*
