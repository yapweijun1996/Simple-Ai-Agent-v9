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

    // Define OpenAI function schema for auto web search
    const functionsSchema = [
      {
        name: 'webSearch',
        description: 'Performs a web search using DuckDuckGo via proxy',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    ];

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
            // Prepare function calling options if CoT is enabled
            const functionOptions = settings.enableCoT
                ? { functions: functionsSchema, function_call: 'auto' }
                : {};
            // Decide whether to use OpenAI path (for GPT models or any function call)
            const useOpenAIPath = selectedModel.startsWith('gpt') || settings.enableCoT;
            if (useOpenAIPath) {
                // Determine the OpenAI model to use (fallback to default if selected is not GPT)
                const modelForCall = selectedModel.startsWith('gpt')
                    ? selectedModel
                    : 'gpt-4.1-mini';
                chatHistory.push({ role: 'user', content: enhancedMessage });
                console.log(`Routing through OpenAI model ${modelForCall}:`, enhancedMessage);
                try {
                    await handleOpenAIMessage(modelForCall, enhancedMessage, functionOptions);
                } catch (err) {
                    // Fallback to Gemini if OpenAI auth fails (e.g., invalid password/API key)
                    const msg = err.message || '';
                    if (msg.includes('API error 401') || msg.toLowerCase().includes('invalid password')) {
                        console.warn('OpenAI auth failed, falling back to Gemini with web search');
                        // Temporarily enable CoT to force web search in Gemini path
                        const prevCoT = settings.enableCoT;
                        settings.enableCoT = true;
                        // Ensure chatHistory has user message for Gemini
                        if (chatHistory.length === 0) {
                            chatHistory.push({ role: 'user', content: '' });
                        }
                        await handleGeminiMessage(selectedModel, enhancedMessage);
                        // Restore CoT setting
                        settings.enableCoT = prevCoT;
                    } else {
                        throw err;
                    }
                }
            } else {
                // Use Gemini path for plain interactions
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
    async function handleOpenAIMessage(model, message, options = {}) {
        if (settings.streaming) {
            // If function calling is requested, disable streaming and fallback to non-streaming
            if (options.functions) {
                console.warn('Streaming disabled when using function calling, switching to non-streaming mode.');
            } else {
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
            }
        }
        // Non-streaming approach: show loader placeholder if using function calling
        if (!settings.streaming || options.functions) {
            let aiMsgElement;
            if (options.functions) {
                aiMsgElement = UIController.createEmptyAIMessage();
            }
            try {
                const result = await ApiService.sendOpenAIRequest(model, chatHistory, options);
                
                if (result.error) {
                    throw new Error(result.error.message);
                }
                
                // Update token usage
                if (result.usage && result.usage.total_tokens) {
                    totalTokens += result.usage.total_tokens;
                }
                
                // Process response
                const messageObj = result.choices[0].message;
                console.log("GPT non-streaming messageObj:", messageObj);

                // Handle function call if triggered
                if (messageObj.function_call) {
                    const fname = messageObj.function_call.name;
                    const args = JSON.parse(messageObj.function_call.arguments || '{}');
                    console.log(`Function call requested: ${fname}`, args);
                    let functionResult;
                    if (fname === 'webSearch' && args.query) {
                        // Update status: searching web
                        UIController.updateStatus(aiMsgElement, '🔍 Searching web...');
                        functionResult = await ApiService.webSearch(args.query);
                        // Update status: fetching content for results
                        UIController.updateStatus(aiMsgElement, '📥 Fetching content...');
                        for (let i = 0; i < Math.min(3, functionResult.length); i++) {
                            const entry = functionResult[i];
                            try {
                                UIController.updateStatus(aiMsgElement, `📥 Fetching (${i+1}/${Math.min(3, functionResult.length)})`);
                                const { content, source } = await ApiService.fetchUrlContent(entry.url);
                                // Debug: log summary and preview
                                console.log(`FETCH: url=${entry.url} | source=${source} | len=${content.length}`);
                                console.log(`PREVIEW: ${content.slice(0,200).replace(/\n/g, ' ')}...`);
                                entry.content = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
                                entry.source = source;
                            } catch (err) {
                                entry.content = `Error fetching content: ${err.message}`;
                                entry.source = 'error';
                            }
                        }
                        // After fetching content, summarize each entry
                        UIController.updateStatus(aiMsgElement, '📝 Summarizing content...');
                        for (let i = 0; i < Math.min(3, functionResult.length); i++) {
                            const entry = functionResult[i];
                            try {
                                entry.summary = await ApiService.summarizeText(entry.content, 3);
                            } catch (err) {
                                entry.summary = `Error summarizing content: ${err.message}`;
                            }
                        }
                        // After summarization, reset status to thinking
                        UIController.updateStatus(aiMsgElement, '🤔 Thinking...');
                    } else {
                        throw new Error(`Unknown function call: ${fname}`);
                    }
                    // Add the function call messages
                    chatHistory.push({ role: 'assistant', name: fname, content: messageObj.function_call.arguments });
                    chatHistory.push({ role: 'function', name: fname, content: JSON.stringify(functionResult) });
                    
                    // Call model for final answer
                    const followup = await ApiService.sendOpenAIRequest(model, chatHistory);
                    const finalMsg = followup.choices[0].message.content;
                    console.log("GPT followup reply:", finalMsg);
                    
                    // Determine display text
                    let displayText;
                    if (settings.enableCoT) {
                        const processed = processCoTResponse(finalMsg);
                        if (processed.thinking) console.log('AI Thinking:', processed.thinking);
                        displayText = formatResponseForDisplay(processed);
                    } else {
                        displayText = finalMsg;
                    }
                    // Update placeholder with final answer and append sources
                    UIController.updateMessageContent(aiMsgElement, displayText);
                    chatHistory.push({ role: 'assistant', content: finalMsg });
                    UIController.addSources(aiMsgElement, functionResult.map(r => ({ url: r.url, source: r.source })));
                    return;
                }
                // Normal response handling (no function call)
                const reply = messageObj.content;
                console.log("GPT non-streaming reply:", reply);
                // Ensure placeholder exists
                if (!aiMsgElement) {
                    aiMsgElement = UIController.createEmptyAIMessage();
                }
                if (settings.enableCoT) {
                    const processed = processCoTResponse(reply);
                    if (processed.thinking) console.log('AI Thinking:', processed.thinking);
                    const displayText = formatResponseForDisplay(processed);
                    UIController.updateMessageContent(aiMsgElement, displayText);
                } else {
                    UIController.updateMessageContent(aiMsgElement, reply);
                }
                chatHistory.push({ role: 'assistant', content: reply });
            } catch (err) {
                // Show error placeholder
                if (aiMsgElement) {
                    UIController.updateMessageContent(aiMsgElement, 'Error: ' + err.message);
                } else {
                    UIController.addMessage('ai', 'Error: ' + err.message);
                }
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
        
        // Determine if streaming should be used (disable when performing webSearch)
        const allowStreaming = settings.streaming && !settings.enableCoT;
        // If CoT is enabled, perform web search flow before asking Gemini
        let aiMsgElementForFunction = null;
        let functionResult = null;
        if (settings.enableCoT) {
            aiMsgElementForFunction = UIController.createEmptyAIMessage();
            UIController.updateStatus(aiMsgElementForFunction, '🔍 Searching web...');
            // Perform the search
            try {
                functionResult = await ApiService.webSearch(message);
            } catch (err) {
                UIController.updateMessageContent(aiMsgElementForFunction, 'Error: ' + err.message);
                throw err;
            }
            // Fetch content for top results
            UIController.updateStatus(aiMsgElementForFunction, '📥 Fetching content...');
            for (let i = 0; i < Math.min(3, functionResult.length); i++) {
                const entry = functionResult[i];
                try {
                    UIController.updateStatus(aiMsgElementForFunction, `📥 Fetching (${i+1}/${Math.min(3, functionResult.length)})`);
                    const { content, source } = await ApiService.fetchUrlContent(entry.url);
                    entry.content = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
                    entry.source = source;
                } catch (err) {
                    entry.content = `Error fetching content: ${err.message}`;
                    entry.source = 'error';
                }
            }
            // Summarize fetched content
            UIController.updateStatus(aiMsgElementForFunction, '📝 Summarizing content...');
            for (let i = 0; i < Math.min(3, functionResult.length); i++) {
                const entry = functionResult[i];
                try {
                    entry.summary = await ApiService.summarizeText(entry.content, 3);
                } catch (err) {
                    entry.summary = `Error summarizing content: ${err.message}`;
                }
            }
            // Ready to think
            UIController.updateStatus(aiMsgElementForFunction, '🤔 Thinking...');
            // Inject function messages so Gemini sees the search results
            chatHistory.push({ role: 'assistant', name: 'webSearch', content: JSON.stringify({ query: message }) });
            chatHistory.push({ role: 'function', name: 'webSearch', content: JSON.stringify(functionResult) });
        }
        
        if (allowStreaming) {
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
            // Non-streaming approach (with or without CoT)
            try {
                const session = ApiService.createGeminiSession(model);
                const result = await session.sendMessage(message, chatHistory);
                // Update token usage if available
                if (result.usageMetadata && typeof result.usageMetadata.totalTokenCount === 'number') {
                    totalTokens += result.usageMetadata.totalTokenCount;
                }
                // Extract text response
                const candidate = result.candidates[0];
                let textResponse = '';
                if (candidate.content.parts) {
                    textResponse = candidate.content.parts.map(p => p.text).join(' ');
                } else if (candidate.content.text) {
                    textResponse = candidate.content.text;
                }
                // Process response (CoT formatting if enabled)
                let displayText;
                if (settings.enableCoT) {
                    const processed = processCoTResponse(textResponse);
                    if (processed.thinking) console.log('AI Thinking:', processed.thinking);
                    displayText = formatResponseForDisplay(processed);
                } else {
                    displayText = textResponse;
                }
                // Render to UI, reusing placeholder if webSearch was used
                if (aiMsgElementForFunction) {
                    UIController.updateMessageContent(aiMsgElementForFunction, displayText);
                    UIController.addSources(aiMsgElementForFunction, functionResult.map(r => ({ url: r.url, source: r.source })));
                } else {
                    UIController.addMessage('ai', displayText);
                }
                // Add final answer to history
                chatHistory.push({ role: 'assistant', content: textResponse });
            } catch (err) {
                if (aiMsgElementForFunction) {
                    UIController.updateMessageContent(aiMsgElementForFunction, 'Error: ' + err.message);
                }
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