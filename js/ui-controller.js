/**
 * ./js/ui-controller.js
 * UI Controller Module - Manages UI elements and interactions
 * Handles chat display, inputs, and visual elements
 */
const UIController = (function() {
    'use strict';

    // Private state
    let sendMessageCallback = null;
    let clearChatCallback = null;
    
    /**
     * Initializes the UI controller
     */
    function init() {
        // Show the chat container
        document.getElementById('chat-container').style.display = 'flex';
        
        // Add enter key handler for message input
        const messageInput = document.getElementById('message-input');
        messageInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (sendMessageCallback) sendMessageCallback();
            }
        });
        
        // Auto-resize textarea as user types
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        
        // Add global event delegation for thinking toggle buttons
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('toggle-thinking') || 
                event.target.parentElement.classList.contains('toggle-thinking')) {
                const button = event.target.classList.contains('toggle-thinking') ? 
                               event.target : event.target.parentElement;
                const messageElement = button.closest('.chat-app__message');
                
                // Toggle the expanded state
                const isExpanded = button.getAttribute('data-expanded') === 'true';
                button.setAttribute('data-expanded', !isExpanded);
                
                // Toggle visibility of thinking section
                if (messageElement) {
                    messageElement.classList.toggle('thinking-collapsed');
                    button.textContent = isExpanded ? 'Show thinking' : 'Hide thinking';
                }
            }
        });
    }

    /**
     * Sets up event handlers for UI elements
     * @param {Function} onSendMessage - Callback for send button
     * @param {Function} onClearChat - Callback for clear chat button
     */
    function setupEventHandlers(onSendMessage, onClearChat) {
        sendMessageCallback = onSendMessage;
        clearChatCallback = onClearChat;
        
        // Send button click handler
        document.getElementById('send-button').addEventListener('click', onSendMessage);
        
        // Clear chat button click handler
        const clearChatButton = document.getElementById('clear-chat-button');
        if (clearChatButton) {
            clearChatButton.addEventListener('click', function() {
                if (confirm('Are you sure you want to clear the chat history?')) {
                    clearChatWindow();
                    if (clearChatCallback) clearChatCallback();
                }
            });
        }
    }

    /**
     * Adds a message to the chat window
     * @param {string} sender - The sender ('user' or 'ai')
     * @param {string} text - The message text
     * @returns {Element} - The created message element
     */
    function addMessage(sender, text) {
        const chatWindow = document.getElementById('chat-window');
        const messageElement = Utils.createFromTemplate('message-template');
        
        // Set appropriate class based on sender
        messageElement.classList.add(`${sender}-message`);
        
        // Format the message text
        updateMessageContent(messageElement, text);
        
        // Add to chat window and scroll into view
        chatWindow.appendChild(messageElement);
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        
        return messageElement;
    }

    /**
     * Clears all messages from the chat window
     */
    function clearChatWindow() {
        const chatWindow = document.getElementById('chat-window');
        chatWindow.innerHTML = '';
    }

    /**
     * Updates the content of a message element
     * @param {Element} messageElement - The message element to update
     * @param {string} text - The new text content
     */
    function updateMessageContent(messageElement, text) {
        if (!messageElement) return;
        
        const contentElement = messageElement.querySelector('.chat-app__message-content');
        if (!contentElement) return;
        
        // Remove existing toggle button if present
        const existingToggle = messageElement.querySelector('.toggle-thinking');
        if (existingToggle) {
            existingToggle.remove();
        }
        
        // Add thinking indicator if it's a thinking message
        if (text === '🤔 Thinking...') {
            contentElement.className = 'chat-app__message-content thinking-indicator';
            contentElement.textContent = 'Thinking...';
            return;
        }
        
        // Reset content element class
        contentElement.className = 'chat-app__message-content';
        
        // Format code blocks and check for structured reasoning
        if (text.includes('```')) {
            // Render code blocks
            contentElement.innerHTML = formatCodeBlocks(text);
        } else {
            // Apply regular text formatting
            contentElement.innerHTML = formatTextWithReasoningHighlights(text);
        }
        
        // Add toggle button for CoT responses if they have thinking
        if (text.includes('Thinking:') && text.includes('Answer:') && messageElement.classList.contains('ai-message')) {
            const toggleButton = document.createElement('button');
            toggleButton.className = 'toggle-thinking';
            toggleButton.textContent = 'Hide thinking';
            toggleButton.setAttribute('data-expanded', 'true');
            
            // Add button after the content
            contentElement.parentNode.insertBefore(toggleButton, contentElement.nextSibling);
        }
    }
    
    /**
     * Formats text with highlighting for reasoning sections
     * @param {string} text - The text to format
     * @returns {string} - HTML formatted text
     */
    function formatTextWithReasoningHighlights(text) {
        // Escape any HTML first
        let escapedText = escapeHtml(text);
        
        // Replace newlines with <br> tags
        let formattedText = escapedText.replace(/\n/g, '<br>');
        
        // Check for and highlight reasoning patterns
        if (text.includes('Thinking:') && text.includes('Answer:')) {
            // Split into thinking and answer sections
            const thinkingMatch = text.match(/Thinking:(.*?)(?=Answer:|$)/s);
            const answerMatch = text.match(/Answer:(.*?)$/s);
            
            if (thinkingMatch && answerMatch) {
                const thinkingContent = escapeHtml(thinkingMatch[1].trim());
                const answerContent = escapeHtml(answerMatch[1].trim());
                
                formattedText = `<div class="thinking-section"><strong>Thinking:</strong><br>${thinkingContent.replace(/\n/g, '<br>')}</div>
                                <div class="answer-section"><strong>Answer:</strong><br>${answerContent.replace(/\n/g, '<br>')}</div>`;
            }
        }
        
        return formattedText;
    }
    
    /**
     * Safely escapes HTML
     * @param {string} html - The string to escape
     * @returns {string} - Escaped HTML string
     */
    function escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
    
    /**
     * Formats code blocks in message text
     * @param {string} text - The message text
     * @returns {string} - HTML with formatted code blocks
     */
    function formatCodeBlocks(text) {
        let formatted = '';
        let insideCode = false;
        let codeBlockLang = '';
        let currentText = '';
        
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('```')) {
                if (!insideCode) {
                    // Start of code block
                    if (currentText) {
                        formatted += `<div>${formatTextWithReasoningHighlights(currentText)}</div>`;
                        currentText = '';
                    }
                    
                    insideCode = true;
                    codeBlockLang = line.slice(3).trim();
                    formatted += `<pre><code class="language-${codeBlockLang}">`;
                } else {
                    // End of code block
                    insideCode = false;
                    formatted += '</code></pre>';
                }
            } else if (insideCode) {
                // Inside code block
                formatted += escapeHtml(line) + '\n';
            } else {
                // Regular text
                currentText += (currentText ? '\n' : '') + line;
            }
        }
        
        // Add any remaining text
        if (currentText) {
            formatted += formatTextWithReasoningHighlights(currentText);
        }
        
        return formatted;
    }

    /**
     * Gets the user input from the message input field
     * @returns {string} - The user message
     */
    function getUserInput() {
        const messageInput = document.getElementById('message-input');
        return messageInput.value.trim();
    }

    /**
     * Clears the message input field
     */
    function clearUserInput() {
        const messageInput = document.getElementById('message-input');
        messageInput.value = '';
        messageInput.style.height = 'auto'; // Reset height
    }

    /**
     * Creates an empty AI message element placeholder
     * @returns {Element} - The created message element
     */
    function createEmptyAIMessage() {
        const chatWindow = document.getElementById('chat-window');
        const messageElement = Utils.createFromTemplate('message-template');
        messageElement.classList.add('ai-message');
        
        const contentElement = messageElement.querySelector('.chat-app__message-content');
        contentElement.innerHTML = '<span class="thinking-indicator">Thinking...</span>'; // Placeholder
        
        chatWindow.appendChild(messageElement);
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        
        return messageElement;
    }

    // Add status bar control methods
    function showStatus(message) {
        const bar = document.getElementById('status-bar');
        if (bar) {
            bar.textContent = message;
            bar.style.visibility = 'visible';
        }
    }

    function clearStatus() {
        const bar = document.getElementById('status-bar');
        if (bar) {
            bar.textContent = '';
            bar.style.visibility = 'hidden';
        }
    }

    // Public API
    return {
        init,
        setupEventHandlers,
        addMessage,
        clearChatWindow,
        updateMessageContent,
        getUserInput,
        clearUserInput,
        createEmptyAIMessage,
        showStatus,
        clearStatus,
        /**
         * Adds a chat bubble with raw HTML content (for tool results)
         * @param {string} sender - 'user' or 'ai'
         * @param {string} html - HTML string for the bubble content
         * @returns {Element} - The created message element
         */
        addHtmlMessage(sender, html) {
            const chatWindow = document.getElementById('chat-window');
            const messageElement = Utils.createFromTemplate('message-template');
            messageElement.classList.add(`${sender}-message`);
            const contentElement = messageElement.querySelector('.chat-app__message-content');
            contentElement.innerHTML = html;
            chatWindow.appendChild(messageElement);
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
            return messageElement;
        }
    };
})(); 