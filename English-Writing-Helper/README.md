**Item Title:**
English Writer with Gemini

**Item Summary:**
Get instant English writing help. Translate text into English and choose formal/conversational styles with Gemini or OpenAI.

**Main Description:**

Effortlessly improve your English writing across the web with English Writer, powered by Google's Gemini API. This extension provides real-time assistance, helping you express yourself clearly and confidently in various contexts.

**Key Features:**

*   **Real-time Translation:** Instantly translate non-English text into English as you type or from selected text.
*   **Style Options:** Choose between Formal and Conversational English to suit your needs.
*   **Custom Translation Instructions:** Advanced users can define their own translation prompt for specific tones, formats, or contexts.
*   **Gemini/OpenAI Powered:** Use Google's Gemini API or OpenAI models for high-quality writing suggestions.
*   **Customizable:** Use your own Gemini or OpenAI API key and set a default writing style (Formal/Conversational).
*   **Display Language:** The interface follows your Chrome/system language by default, with a manual language override in settings.
*   **Flexible Display:** View suggestions in a convenient sidebar or directly below your input field.
*   **Easy Control:** Quickly toggle the extension on or off as needed.

**Why Install English Writer?**

*   **Boost Confidence & Efficiency:** Write in English with greater assurance and speed.
*   **Learn & Adapt:** Understand how to express your ideas naturally in different English tones.
*   **Versatile Use:** Ideal for crafting emails, social media posts, messages, and more.
*   **Seamless Integration:** Get instant English suggestions directly on almost any webpage input field.

**Important Notes:**

*   **API Key Required:** This extension requires your own Google Gemini or OpenAI API key to function.
*   **Potential API Costs:** Use of the selected AI API may incur costs based on your usage. Please refer to the provider's pricing for details.
*   **Privacy-Friendly Usage Reporting:** Anonymous usage statistics are off by default and can be enabled to help improve the product. The extension counts translation attempts and character totals, but does not send source text, translated text, API keys, page URLs, or browsing history.
*   **Current Limitations:** Works best with standard HTML input fields and textareas. Support for some rich-text editors may be limited.
*   **Focus:** Designed for non-native English writers who want to translate and practice writing in English.

**Local Smoke Test:**

Run the automated unpacked-extension smoke test before packaging:

```bash
node scripts/smoke-test-extension.js
```

To test a real API call, provide one API key through the environment:

```bash
EW_GEMINI_API_KEY=your_key node scripts/smoke-test-extension.js
EW_OPENAI_API_KEY=your_key node scripts/smoke-test-extension.js
```

For the Chinese (Traditional) version of this description, please see [README_zh.md](README_zh.md).
