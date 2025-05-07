/**
 * ./js/app.js
 * Main Application Module - Entry point for the application
 * Coordinates initialization of all other modules
 */
const App = (function() {
    'use strict';
    
    // Private state
    let loginModal = null;

    /**
     * Initializes the application
     */
    function init() {
        // Initialize UI controller
        UIController.init();
        
        // Load saved settings from cookie
        const savedSettings = Utils.getSettingsFromCookie() || {};
        
        // Initialize settings controller with saved settings
        SettingsController.init();
        
        // Initialize chat controller with settings
        ChatController.init(savedSettings);
        
        // Show main container (will be visible but login modal on top)
        document.getElementById('chat-container').style.display = 'flex';
        
        // Prompt for password or allow skipping GPT
        checkPasswordOrPrompt();
    }

    /**
     * Checks for a saved password or prompts the user
     */
    function checkPasswordOrPrompt() {
        const savedPassword = Utils.getPasswordFromCookie();
        
        if (savedPassword) {
            doLogin(savedPassword);
        } else {
            showLoginModal();
        }
    }
    
    /**
     * Creates and shows the login modal
     */
    function showLoginModal() {
        if (!loginModal) {
            // Create login modal from template
            loginModal = Utils.createFromTemplate('login-modal-template');
            document.body.appendChild(loginModal);
            
            // Setup event listeners
            document.getElementById('login-button').addEventListener('click', handleLogin);
            document.getElementById('skip-login-button').addEventListener('click', handleSkipLogin);
            document.getElementById('api-password').addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    handleLogin();
                }
            });
            
            // Focus the password input
            setTimeout(() => {
                document.getElementById('api-password').focus();
            }, 100);
        }
        
        loginModal.style.display = 'flex';
        document.getElementById('login-error').style.display = 'none';
    }
    
    /**
     * Handles login form submission
     */
    function handleLogin() {
        const passwordInput = document.getElementById('api-password');
        const rememberCheckbox = document.getElementById('remember-password');
        const password = passwordInput.value.trim();
        
        if (!password) {
            document.getElementById('login-error').textContent = 'Password is required.';
            document.getElementById('login-error').style.display = 'block';
            return;
        }
        
        // Attempt to init OpenAI key
        const success = ApiService.init(password);
        if (success) {
            // Store settings and mark we have a valid OpenAI key
            ChatController.updateSettings({
                rememberPassword: rememberCheckbox.checked,
                hasOpenAIKey: true
            });
            // Save password if remember is checked
            if (rememberCheckbox.checked) {
                Utils.savePasswordToCookie(password);
            }
            // Hide the login modal
            loginModal.style.display = 'none';
        } else {
            // Invalid password: proceed in Gemini-only mode
            ChatController.updateSettings({ hasOpenAIKey: false });
            // Hide modal and clear saved password
            Utils.clearSavedPassword();
            loginModal.style.display = 'none';
            // Optionally inform the user
            console.warn('Invalid API key – continuing in Gemini/Gemma-only mode.');
        }
    }
    
    /**
     * Attempts to login with the provided password
     * @param {string} password - The API key password
     */
    function doLogin(password) {
        const success = ApiService.init(password);
        if (success) {
            ChatController.updateSettings({ hasOpenAIKey: true });
        } else {
            Utils.clearSavedPassword();
            ChatController.updateSettings({ hasOpenAIKey: false });
            showLoginModal();
        }
    }
    
    /**
     * Logs the user out by clearing saved credentials
     */
    function logOut() {
        Utils.clearSavedPassword();
        location.reload();
    }

    /**
     * User opts to skip GPT login
     */
    function handleSkipLogin() {
        ChatController.updateSettings({ hasOpenAIKey: false });
        loginModal.style.display = 'none';
    }

    // Initialize the app when the DOM is ready
    window.addEventListener('DOMContentLoaded', init);
    
    // Public API
    return {
        init,
        logOut
    };
})();

// The app will auto-initialize when the DOM is loaded 