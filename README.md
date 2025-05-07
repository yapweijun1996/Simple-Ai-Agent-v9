# Simple AI Chat Agent

An interactive AI chat assistant supporting multiple language models (GPT-4.1, Gemini, Gemma) with advanced reasoning features and built-in web tools.

## Features

- **Multi-Model Support:** Chat with GPT-4.1, Gemini 2.0, or Gemma 3-27b IT.
- **Chain of Thought Reasoning:** Enable step-by-step AI reasoning for more transparent answers.
- **Streaming Responses:** See AI responses as they are generated.
- **Web Tools Integration:** The AI can:
  - Search the web
  - Read web pages
  - Fetch instant answers (DuckDuckGo)
- **User-Friendly Interface:** Clean chat UI with settings and token usage display.
- **Secure API Key Handling:** API keys are encrypted; users provide a password to unlock.

## Getting Started

1. **Clone or Download the Repository**
   ```sh
   git clone https://github.com/yourusername/Simple-Ai-Agent-v9.git
   cd Simple-Ai-Agent-v9
   ```

2. **Open the App**
   - Simply open `index.html` in your web browser.
   - Or use a local web server for best results (recommended for some browsers):
     ```sh
     npx serve .
     # or
     python3 -m http.server
     ```

3. **Login**
   - On first use, enter your password to decrypt the API key.
   - Optionally, check "Remember password" to save it for future sessions.

## Usage

- **Chat:** Type your message and press "Send" or hit Enter.
- **Settings:** Click "Settings" to:
  - Switch AI models
  - Enable/disable streaming
  - Enable Chain of Thought reasoning
  - Show/hide the AI's thinking process
- **Clear Chat:** Use the "Clear Chat" button to reset the conversation.
- **Token Usage:** See total tokens used at the top.

## Configuration

- **API Keys:** The app uses encrypted API keys. You only need to provide the password when prompted.
- **Settings:** Preferences are saved in your browser cookies.

## Folder Structure

- `index.html` — Main HTML file
- `js/` — JavaScript modules:
  - `app.js` — App entry point
  - `chat-controller.js` — Chat logic and history
  - `ui-controller.js` — User interface management
  - `api-service.js` — Handles API requests
  - `settings-controller.js` — Settings modal logic
  - `tools-service.js` — Web tools (search, read, instant answer)
  - `utils.js` — Utility functions
- `css/` — Stylesheets

## Preview
<img width="1440" alt="og_img" src="https://github.com/user-attachments/assets/d470f9a0-106c-4ac8-8809-1cdbf3abfbd0" />


## License

[MIT](LICENSE) (or specify your license here)

---

**Credits:**  
- Powered by OpenAI, Google Gemini, and Gemma models.  
- Web search and instant answers via DuckDuckGo.

---

*Simple AI Chat Agent — making AI chat more transparent and powerful!*
