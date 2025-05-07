/**
 * ./js/chat-controller.js
 * Chat Controller Module - Manages chat history and message handling
 * Coordinates between UI and API service for sending/receiving messages
 */
const ChatController = (function() {
    'use strict';

    // Private state
    let chatHistory = [];
    let totalTokens = 0;
    let settings = { streaming: false, enableCoT: false, showThinking: true };
    let isThinking = false;
    let lastThinkingContent = '';
    let lastAnswerContent = '';

    const cotPreamble = `**Chain of Thought Instructions:**
1.  **Understand:** Briefly rephrase the core problem or question.
2.  **Deconstruct:** Break the problem down into smaller, logical steps needed to reach the solution.
3.  **Execute & Explain:** Work through each step sequentially. Show your reasoning, calculations, or data analysis for each step clearly.
4.  **Synthesize:** Combine the findings from the previous steps to formulate the final conclusion.
5.  **Final Answer:** State the final answer clearly and concisely, prefixed exactly with "\\nFinal Answer:".

Begin Reasoning Now:
`;

    /**
     * Initializes the chat controller
     * @param {Object} initialSettings - Initial settings for the chat
     */
    function init(initialSettings) {
        // Reset and seed chatHistory with system tool instructions
        chatHistory = [{
            role: 'system',
            content: `You are an AI assistant with access to three tools for external information:
1. web_search(query) → returns a JSON array of search results [{title, url, snippet}, …]
2. read_url(url) → returns the text content of a web page
3. instant_answer(query) → returns a JSON object from DuckDuckGo's Instant Answer API for quick facts, definitions, and summaries (no proxies needed)

For any question requiring up-to-date facts, statistics, or concise definitions, choose the appropriate tool above and call it exactly once per question.

When calling a tool, output EXACTLY a JSON object and nothing else, in this format:
{"tool":"web_search","arguments":{"query":"your query"}}
or
{"tool":"read_url","arguments":{"url":"https://example.com"}}
or
{"tool":"instant_answer","arguments":{"query":"your query"}}

Wait for the tool result to be provided before continuing your explanation or final answer.
After receiving the tool result, continue thinking step-by-step and then provide your answer.`
        }];
        if (initialSettings) {
            settings = { ...settings, ...initialSettings };
        }
        
        // Set up event handlers through UI controller
        UIController.setupEventHandlers(sendMessage, clearChat);
    }

    /**
     * Updates the settings
     * @param {Object} newSettings - The new settings
     */
    function updateSettings(newSettings) {
        settings = { ...settings, ...newSettings };
        console.log('Chat settings updated:', settings);
    }

    /**
     * Clears the chat history and resets token count
     */
    function clearChat() {
        chatHistory = [];
        totalTokens = 0;
        Utils.updateTokenDisplay(0);
    }

    /**
     * Gets the current settings
     * @returns {Object} - The current settings
     */
    function getSettings() {
        return { ...settings };
    }

    /**
     * Generates Chain of Thought prompting instructions
     * @param {string} message - The user message
     * @returns {string} - The CoT enhanced message
     */
    function enhanceWithCoT(message) {
        return `${message}\n\nI'd like you to use Chain of Thought reasoning. Please think step-by-step before providing your final answer. Format your response like this:
Thinking: [detailed reasoning process, exploring different angles and considerations]
Answer: [your final, concise answer based on the reasoning above]`;
    }

    /**
     * Processes the AI response to extract thinking and answer parts
     * @param {string} response - The raw AI response
     * @returns {Object} - Object with thinking and answer components
     */
    function processCoTResponse(response) {
        console.log("processCoTResponse received:", response);
        // Check if response follows the Thinking/Answer format
        const thinkingMatch = response.match(/Thinking:(.*?)(?=Answer:|$)/s);
        const answerMatch = response.match(/Answer:(.*?)$/s);
        console.log("processCoTResponse: thinkingMatch", thinkingMatch, "answerMatch", answerMatch);
        
        if (thinkingMatch && answerMatch) {
            const thinking = thinkingMatch[1].trim();
            const answer = answerMatch[1].trim();
            
            // Update the last known content
            lastThinkingContent = thinking;
            lastAnswerContent = answer;
            
            return {
                thinking: thinking,
                answer: answer,
                hasStructuredResponse: true
            };
        } else if (response.startsWith('Thinking:') && !response.includes('Answer:')) {
            // Partial thinking (no answer yet)
            const thinking = response.replace(/^Thinking:/, '').trim();
            lastThinkingContent = thinking;
            
            return {
                thinking: thinking,
                answer: lastAnswerContent,
                hasStructuredResponse: true,
                partial: true,
                stage: 'thinking'
            };
        } else if (response.includes('Thinking:') && !thinkingMatch) {
            // Malformed response (partial reasoning)
            const thinking = response.replace(/^.*?Thinking:/s, 'Thinking:');
            
            return {
                thinking: thinking.replace(/^Thinking:/, '').trim(),
                answer: '',
                hasStructuredResponse: false,
                partial: true
            };
        }
        
        // If not properly formatted, return the whole response as the answer
        return {
            thinking: '',
            answer: response,
            hasStructuredResponse: false
        };
    }
    
    /**
     * Extract and update partial CoT response during streaming
     * @param {string} fullText - The current streamed text
     * @returns {Object} - The processed response object
     */
    function processPartialCoTResponse(fullText) {
        console.log("processPartialCoTResponse received:", fullText);
        if (fullText.includes('Thinking:') && !fullText.includes('Answer:')) {
            // Only thinking so far
            const thinking = fullText.replace(/^.*?Thinking:/s, '').trim();
            
            return {
                thinking: thinking,
                answer: '',
                hasStructuredResponse: true,
                partial: true,
                stage: 'thinking'
            };
        } else if (fullText.includes('Thinking:') && fullText.includes('Answer:')) {
            // Both thinking and answer are present
            const thinkingMatch = fullText.match(/Thinking:(.*?)(?=Answer:|$)/s);
            const answerMatch = fullText.match(/Answer:(.*?)$/s);
            
            if (thinkingMatch && answerMatch) {
                return {
                    thinking: thinkingMatch[1].trim(),
                    answer: answerMatch[1].trim(),
                    hasStructuredResponse: true,
                    partial: false
                };
            }
        }
        
        // Default case - treat as normal text
        return {
            thinking: '',
            answer: fullText,
            hasStructuredResponse: false
        };
    }

    /**
     * Formats the response for display based on settings
     * @param {Object} processed - The processed response with thinking and answer
     * @returns {string} - The formatted response for display
     */
    function formatResponseForDisplay(processed) {
        if (!settings.enableCoT || !processed.hasStructuredResponse) {
            return processed.answer;
        }

        // If showThinking is enabled, show both thinking and answer
        if (settings.showThinking) {
            if (processed.partial && processed.stage === 'thinking') {
                return `Thinking: ${processed.thinking}`;
            } else if (processed.partial) {
                return processed.thinking; // Just the partial thinking
            } else {
                return `Thinking: ${processed.thinking}\n\nAnswer: ${processed.answer}`;
            }
        } else {
            // Otherwise just show the answer (or thinking indicator if answer isn't ready)
            return processed.answer || '🤔 Thinking...';
        }
    }

    /**
     * Sends a message to the AI and handles the response
     */
    async function sendMessage() {
        const message = UIController.getUserInput();
        if (!message) return;
        
        // Show status and disable inputs while awaiting AI
        UIController.showStatus('Sending message...');
        document.getElementById('message-input').disabled = true;
        document.getElementById('send-button').disabled = true;
        
        // Reset the partial response tracking
        lastThinkingContent = '';
        lastAnswerContent = '';
        
        // Add user message to UI
        UIController.addMessage('user', message);
        UIController.clearUserInput();
        
        // Apply CoT formatting if enabled
        const enhancedMessage = settings.enableCoT ? enhanceWithCoT(message) : message;
        
        // Get the selected model from SettingsController
        const currentSettings = SettingsController.getSettings();
        const selectedModel = currentSettings.selectedModel;
        
        try {
            if (selectedModel.startsWith('gpt')) {
                // For OpenAI, add enhanced message to chat history before sending to include the CoT prompt.
                chatHistory.push({ role: 'user', content: enhancedMessage });
                console.log("Sent enhanced message to GPT:", enhancedMessage);
                await handleOpenAIMessage(selectedModel, enhancedMessage);
            } else {
                // For Gemini, ensure chat history starts with user message if empty
                if (chatHistory.length === 0) {
                    chatHistory.push({ role: 'user', content: '' });
                }
                await handleGeminiMessage(selectedModel, enhancedMessage);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            UIController.addMessage('ai', 'Error: ' + error.message);
        } finally {
            // Update token usage display
            Utils.updateTokenDisplay(totalTokens);
            // Clear status and re-enable inputs
            UIController.clearStatus();
            document.getElementById('message-input').disabled = false;
            document.getElementById('send-button').disabled = false;
        }
    }

    /**
     * Handles OpenAI message processing
     * @param {string} model - The OpenAI model to use
     * @param {string} message - The user message
     */
    async function handleOpenAIMessage(model, message) {
        if (settings.streaming) {
            // Show status for streaming response
            UIController.showStatus('Streaming response...');
            // Streaming approach
            const aiMsgElement = UIController.createEmptyAIMessage();
            let streamedResponse = '';
            
            try {
                // Start thinking indicator if CoT is enabled
                if (settings.enableCoT) {
                    isThinking = true;
                    UIController.updateMessageContent(aiMsgElement, '🤔 Thinking...');
                }
                
                // Process streaming response
                const fullReply = await ApiService.streamOpenAIRequest(
                    model, 
                    chatHistory,
                    (chunk, fullText) => {
                        streamedResponse = fullText;
                        
                        if (settings.enableCoT) {
                            // Process the streamed response for CoT
                            const processed = processPartialCoTResponse(fullText);
                            
                            // Only show "Thinking..." if we're still waiting
                            if (isThinking && fullText.includes('Answer:')) {
                                isThinking = false;
                            }
                            
                            // Format according to current stage and settings
                            const displayText = formatResponseForDisplay(processed);
                            UIController.updateMessageContent(aiMsgElement, displayText);
                        } else {
                            UIController.updateMessageContent(aiMsgElement, fullText);
                        }
                    }
                );
                
                // Intercept JSON tool call in streaming mode
                let toolCall = null;
                try {
                    toolCall = JSON.parse(fullReply.trim());
                } catch (e) {}
                if (toolCall && toolCall.tool && toolCall.arguments) {
                    await processToolCall(toolCall);
                    return;
                }
                
                // Process response for CoT if enabled
                if (settings.enableCoT) {
                    const processed = processCoTResponse(fullReply);
                    
                    // Add thinking to debug console if available
                    if (processed.thinking) {
                        console.log('AI Thinking:', processed.thinking);
                    }
                    
                    // Update UI with appropriate content based on settings
                    const displayText = formatResponseForDisplay(processed);
                    UIController.updateMessageContent(aiMsgElement, displayText);
                    
                    // Add full response to chat history
                    chatHistory.push({ role: 'assistant', content: fullReply });
                } else {
                    // Add to chat history after completed
                    chatHistory.push({ role: 'assistant', content: fullReply });
                }
                
                // Get token usage
                const tokenCount = await ApiService.getTokenUsage(model, chatHistory);
                if (tokenCount) {
                    totalTokens += tokenCount;
                }
            } catch (err) {
                UIController.updateMessageContent(aiMsgElement, 'Error: ' + err.message);
                throw err;
            } finally {
                isThinking = false;
            }
        } else {
            // Show status for non-streaming response
            UIController.showStatus('Waiting for AI response...');
            // Non-streaming approach
            try {
                const result = await ApiService.sendOpenAIRequest(model, chatHistory);
                
                if (result.error) {
                    throw new Error(result.error.message);
                }
                
                // Update token usage
                if (result.usage && result.usage.total_tokens) {
                    totalTokens += result.usage.total_tokens;
                }
                
                // Process response
                const reply = result.choices[0].message.content;
                console.log("GPT non-streaming reply:", reply);

                // Intercept tool call JSON
                let toolCall = null;
                try {
                    toolCall = JSON.parse(reply);
                } catch (e) {}
                if (toolCall && toolCall.tool && toolCall.arguments) {
                    await processToolCall(toolCall);
                    return;
                }
                
                if (settings.enableCoT) {
                    const processed = processCoTResponse(reply);
                    
                    // Add thinking to debug console if available
                    if (processed.thinking) {
                        console.log('AI Thinking:', processed.thinking);
                    }
                    
                    // Add the full response to chat history
                    chatHistory.push({ role: 'assistant', content: reply });
                    
                    // Show appropriate content in the UI based on settings
                    const displayText = formatResponseForDisplay(processed);
                    UIController.addMessage('ai', displayText);
                } else {
                    chatHistory.push({ role: 'assistant', content: reply });
                    UIController.addMessage('ai', reply);
                }
            } catch (err) {
                throw err;
            }
        }
    }

    /**
     * Handles Gemini message processing
     * @param {string} model - The Gemini model to use
     * @param {string} message - The user message
     */
    async function handleGeminiMessage(model, message) {
        // Add current message to chat history
        chatHistory.push({ role: 'user', content: message });
        
        if (settings.streaming) {
            // Streaming approach
            const aiMsgElement = UIController.createEmptyAIMessage();
            let streamedResponse = '';
            
            try {
                // Start thinking indicator if CoT is enabled
                if (settings.enableCoT) {
                    isThinking = true;
                    UIController.updateMessageContent(aiMsgElement, '🤔 Thinking...');
                }
                
                // Process streaming response
                const fullReply = await ApiService.streamGeminiRequest(
                    model,
                    chatHistory,
                    (chunk, fullText) => {
                        streamedResponse = fullText;
                        
                        if (settings.enableCoT) {
                            // Process the streamed response for CoT
                            const processed = processPartialCoTResponse(fullText);
                            
                            // Only show "Thinking..." if we're still waiting
                            if (isThinking && fullText.includes('Answer:')) {
                                isThinking = false;
                            }
                            
                            // Format according to current stage and settings
                            const displayText = formatResponseForDisplay(processed);
                            UIController.updateMessageContent(aiMsgElement, displayText);
                        } else {
                            UIController.updateMessageContent(aiMsgElement, fullText);
                        }
                    }
                );
                
                // Intercept JSON tool call in streaming mode
                let toolCall = null;
                try {
                    toolCall = JSON.parse(fullReply.trim());
                } catch (e) {}
                if (toolCall && toolCall.tool && toolCall.arguments) {
                    await processToolCall(toolCall);
                    return;
                }
                
                // Process response for CoT if enabled
                if (settings.enableCoT) {
                    const processed = processCoTResponse(fullReply);
                    
                    // Add thinking to debug console if available
                    if (processed.thinking) {
                        console.log('AI Thinking:', processed.thinking);
                    }
                    
                    // Update UI with appropriate content based on settings
                    const displayText = formatResponseForDisplay(processed);
                    UIController.updateMessageContent(aiMsgElement, displayText);
                    
                    // Add full response to chat history
                    chatHistory.push({ role: 'assistant', content: fullReply });
                } else {
                    // Add to chat history after completed
                    chatHistory.push({ role: 'assistant', content: fullReply });
                }
                
                // Get token usage
                const tokenCount = await ApiService.getTokenUsage(model, chatHistory);
                if (tokenCount) {
                    totalTokens += tokenCount;
                }
            } catch (err) {
                UIController.updateMessageContent(aiMsgElement, 'Error: ' + err.message);
                throw err;
            } finally {
                isThinking = false;
            }
        } else {
            // Non-streaming approach
            try {
                const session = ApiService.createGeminiSession(model);
                const result = await session.sendMessage(message, chatHistory);
                
                // Update token usage if available
                if (result.usageMetadata && typeof result.usageMetadata.totalTokenCount === 'number') {
                    totalTokens += result.usageMetadata.totalTokenCount;
                }
                
                // Process response
                const candidate = result.candidates[0];
                let textResponse = '';
                
                if (candidate.content.parts) {
                    textResponse = candidate.content.parts.map(p => p.text).join(' ');
                } else if (candidate.content.text) {
                    textResponse = candidate.content.text;
                }
                
                // Intercept JSON tool call in non-streaming mode
                let toolCall = null;
                try {
                    toolCall = JSON.parse(textResponse.trim());
                } catch (e) {}
                if (toolCall && toolCall.tool && toolCall.arguments) {
                    await processToolCall(toolCall);
                    return;
                }
                
                if (settings.enableCoT) {
                    const processed = processCoTResponse(textResponse);
                    
                    // Add thinking to debug console if available
                    if (processed.thinking) {
                        console.log('AI Thinking:', processed.thinking);
                    }
                    
                    // Add the full response to chat history
                    chatHistory.push({ role: 'assistant', content: textResponse });
                    
                    // Show appropriate content in the UI based on settings
                    const displayText = formatResponseForDisplay(processed);
                    UIController.addMessage('ai', displayText);
                } else {
                    chatHistory.push({ role: 'assistant', content: textResponse });
                    UIController.addMessage('ai', textResponse);
                }
            } catch (err) {
                throw err;
            }
        }
    }

    /**
     * Executes a tool call, injects result into chat, and continues reasoning
     */
    async function processToolCall(call) {
        const { tool, arguments: args } = call;
        let result;
        // Show status while calling tool
        if (tool === 'web_search') {
            UIController.showStatus(`Searching web for "${args.query}"...`);
            result = await ToolsService.webSearch(args.query);
            // Format search results
            const items = result || [];
            // Render HTML for UI
            const htmlItems = items.map(r =>
                `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a><br><small>${r.url}</small><p>${Utils.escapeHtml(r.snippet)}</p></li>`
            ).join('');
            const html = `<div class="tool-result" role="group" aria-label="Search results for ${args.query}"><strong>Search results for “${args.query}” (${items.length}):</strong><ul>${htmlItems}</ul></div>`;
            UIController.addHtmlMessage('ai', html);
            // Push plain-text results for the model
            const plainText = items.map(r => `${r.title}\n${r.snippet}\n${r.url}`).join("\n\n");
            chatHistory.push({ role: 'assistant', content: plainText });
        } else if (tool === 'read_url') {
            UIController.showStatus(`Reading content from ${args.url}...`);
            result = await ToolsService.readUrl(args.url);
            const snippet = String(result).slice(0, 500);
            const html = `<div class="tool-result" role="group" aria-label="Read content from ${args.url}"><strong>Read from:</strong> <a href="${args.url}" target="_blank" rel="noopener noreferrer">${args.url}</a><p>${Utils.escapeHtml(snippet)}${String(result).length > 500 ? '...' : ''}</p></div>`;
            UIController.addHtmlMessage('ai', html);
            // Push plain-text snippet for the model
            const plainText = snippet + (String(result).length > 500 ? '...' : '');
            chatHistory.push({ role: 'assistant', content: plainText });
        } else if (tool === 'instant_answer') {
            UIController.showStatus(`Retrieving instant answer for "${args.query}"...`);
            result = await ToolsService.instantAnswer(args.query);
            const text = JSON.stringify(result, null, 2);
            UIController.addMessage('ai', text);
            chatHistory.push({ role: 'assistant', content: text });
        } else {
            throw new Error(`Unknown tool: ${tool}`);
        }
        // Clear status
        UIController.clearStatus();
        // Continue Chain-of-Thought with updated history for the active model
        const selectedModel = SettingsController.getSettings().selectedModel;
        if (selectedModel.startsWith('gpt')) {
            await handleOpenAIMessage(selectedModel, '');
        } else {
            await handleGeminiMessage(selectedModel, '');
        }
    }

    /**
     * Gets the current chat history
     * @returns {Array} - The chat history
     */
    function getChatHistory() {
        return [...chatHistory];
    }

    /**
     * Gets the total tokens used
     * @returns {number} - The total tokens used
     */
    function getTotalTokens() {
        return totalTokens;
    }

    // Public API
    return {
        init,
        updateSettings,
        getSettings,
        sendMessage,
        getChatHistory,
        getTotalTokens,
        clearChat
    };
})(); 