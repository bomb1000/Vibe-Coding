**項目名稱：**
Gemini 英語寫作助手

**項目摘要：**
即時英語寫作輔助。使用 Gemini 或 OpenAI 將文字翻譯成英文，並選擇正式或口語風格。

**主要說明：**

English Writer 可使用您自己的 Gemini/OpenAI API key，也可使用選填的 Managed Credits，讓不想自行申請 API key 的使用者也能翻譯英文。

**主要功能：**

*   **即時翻譯：** 輸入時或選取文字後，可將非英文內容翻譯成英文。
*   **風格選擇：** 可選擇正式或口語化的英語風格，滿足您的不同需求。
*   **自訂翻譯指令：** 進階使用者可自訂翻譯 prompt，指定語氣、格式或使用情境。
*   **Gemini/OpenAI 強力支援：** 可運用 Google Gemini API 或 OpenAI 模型提供高品質的寫作建議。
*   **兩種使用模式：** 可使用自己的 Gemini/OpenAI API key，或使用選填的預付式 Managed Credits。
*   **個人化設定：** 可儲存 AI 服務商、模型、寫作風格、自訂 prompt，以及 BYOK 模式使用的 API key。
*   **顯示語言：** 介面預設跟隨 Chrome/系統語言，也可在設定中手動切換。
*   **靈活顯示：** 可在側邊欄或輸入欄位正下方查看翻譯建議。
*   **輕鬆開關：** 根據需求快速開啟或關閉擴充功能。

**為何安裝 English Writer？**

*   **提升自信與效率：** 更自信且快速地進行英語寫作。
*   **學習與適應：** 學習如何用自然的英語語氣表達您的想法。
*   **多功能用途：** 非常適合撰寫電子郵件、社群媒體貼文、訊息等。
*   **無縫整合：** 在幾乎任何網頁的輸入欄位中即時獲得英語建議。

**重要事項：**

*   **API key 或 Managed Credits：** 可使用自己的 Google Gemini/OpenAI API key，或使用選填的預付式 Managed Credits。
*   **潛在費用：** 使用自己的 API key 可能會產生 AI 服務商費用；Managed Credits 則是預付、依用量扣點。
*   **Managed Credits 隱私：** 在 Managed Credits 模式中，選取文字會送到 English Writing Helper 後端與 AI 服務商，只用來完成翻譯與扣點。使用情況 Dashboard 不會儲存原文或譯文。
*   **隱私友善用量回報：** 第一次使用時會清楚詢問是否同意匿名用量統計。插件只統計翻譯次數與字數，不會傳送原文、譯文、API Key、目前網址或瀏覽紀錄。開啟匿名統計期間，Managed Credits 未來購買會獲得 5% 額外點數。
*   **目前限制：** 最適用於標準 HTML 輸入欄位和文字區域。對部分富文本編輯器的支援可能有限。
*   **焦點功能：** 協助非英語母語者翻譯並練習英文寫作。

**本地 Smoke Test：**

打包前可先執行自動化未封裝擴充功能測試：

```bash
node scripts/smoke-test-extension.js
```

若要測試真實 API 呼叫，可用環境變數提供其中一組 API key：

```bash
EW_GEMINI_API_KEY=your_key node scripts/smoke-test-extension.js
EW_OPENAI_API_KEY=your_key node scripts/smoke-test-extension.js
```
