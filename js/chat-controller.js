/**
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
        }
    }

    /**
     * Handles OpenAI message processing
     * @param {string} model - The OpenAI model to use
     * @param {string} message - The user message
     */
    async function handleOpenAIMessage(model, message) {
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