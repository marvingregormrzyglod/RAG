// src/utils/errorHandler.js

class ErrorHandler {
  /**
   * Handle OpenAI API errors
   */
  static handleOpenAIError(error) {
    console.error('[OpenAI Error]', error);
    
    if (error.message.includes('limit reached')) {
      return {
        success: false,
        error: error.message,
        userMessage: error.message,
        retryable: false
      };
    }
    
    if (error.message.includes('401') || error.message.includes('authentication')) {
      return {
        success: false,
        error: 'API authentication failed',
        userMessage: 'Configuration error. Please contact your administrator.',
        retryable: false
      };
    }
    
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return {
        success: false,
        error: 'OpenAI rate limit exceeded',
        userMessage: 'Too many requests. Please wait a moment and try again.',
        retryable: true,
        retryAfter: 60000 // 1 minute
      };
    }
    
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
      return {
        success: false,
        error: 'OpenAI service unavailable',
        userMessage: 'The AI service is temporarily unavailable. Please try again in a few moments.',
        retryable: true,
        retryAfter: 5000 // 5 seconds
      };
    }
    
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return {
        success: false,
        error: 'Request timeout',
        userMessage: 'The request took too long. Please try again.',
        retryable: true,
        retryAfter: 1000 // 1 second
      };
    }
    
    // Generic error
    return {
      success: false,
      error: error.message,
      userMessage: 'An unexpected error occurred. Please try again.',
      retryable: true,
      retryAfter: 1000
    };
  }

  /**
   * Handle vector search errors
   */
  static handleVectorSearchError(error) {
    console.error('[VectorSearch Error]', error);
    
    if (error.message.includes('not loaded')) {
      return {
        success: false,
        error: 'Knowledge base not initialized',
        userMessage: 'The knowledge base is not ready. Please contact your administrator.',
        retryable: false
      };
    }
    
    return {
      success: false,
      error: error.message,
      userMessage: 'Failed to search knowledge base. Please try again.',
      retryable: true,
      retryAfter: 1000
    };
  }

  /**
   * Handle storage errors
   */
  static handleStorageError(error) {
    console.error('[Storage Error]', error);
    
    return {
      success: false,
      error: error.message,
      userMessage: 'Failed to access storage. Please try again.',
      retryable: true,
      retryAfter: 1000
    };
  }

  /**
   * Generic error handler
   */
  static handle(error, context = 'Operation') {
    console.error(`[${context} Error]`, error);
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      userMessage: `${context} failed. Please try again.`,
      retryable: true,
      retryAfter: 1000
    };
  }
}

export default ErrorHandler;