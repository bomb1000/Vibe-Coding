const FEEDBACK_ISSUE_URL = 'https://github.com/bomb1000/Vibe-Coding/issues/new';
const FEEDBACK_ID_KEY = 'ewFeedbackId';
let currentLanguage = 'en';

function text(key) {
  return EWI18n.translate(key, currentLanguage);
}

function makeFeedbackId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `EWH-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-')}`;
}

function getFeedbackId() {
  return new Promise(resolve => {
    chrome.storage.local.get([FEEDBACK_ID_KEY], result => {
      if (result[FEEDBACK_ID_KEY]) {
        resolve(result[FEEDBACK_ID_KEY]);
        return;
      }
      const feedbackId = makeFeedbackId();
      chrome.storage.local.set({ [FEEDBACK_ID_KEY]: feedbackId }, () => resolve(feedbackId));
    });
  });
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['apiProvider'], result => resolve(result));
  });
}

function getTypeLabel(value) {
  return {
    problem: text('feedbackTypeTextProblem'),
    wish: text('feedbackTypeTextWish'),
    experience: text('feedbackTypeTextExperience'),
  }[value] || value;
}

function getScenarioLabel(value) {
  return {
    general: text('scenarioTextGeneral'),
    email: text('scenarioTextEmail'),
    social: text('scenarioTextSocial'),
    chat: text('scenarioTextChat'),
    docs: text('scenarioTextDocs'),
    other: text('scenarioTextOther'),
  }[value] || value;
}

function buildFeedbackText() {
  const type = document.getElementById('feedbackType').value;
  const scenario = document.getElementById('scenario').value;
  const message = document.getElementById('message').value.trim();
  const email = document.getElementById('email').value.trim();
  const feedbackId = document.getElementById('feedbackId').textContent;
  const version = document.getElementById('extensionVersion').textContent;
  const provider = document.getElementById('apiProvider').textContent;

  return [
    `${text('feedbackTextType')}${getTypeLabel(type)}`,
    `${text('feedbackTextScenario')}${getScenarioLabel(scenario)}`,
    `${text('feedbackTextId')}${feedbackId}`,
    `${text('feedbackTextVersion')}${version}`,
    `${text('feedbackTextProvider')}${provider}`,
    `${text('feedbackTextEmail')}${email || text('feedbackTextEmailEmpty')}`,
    '',
    text('feedbackTextContent'),
    message || text('feedbackTextEmpty'),
  ].join('\n');
}

function buildIssueUrl() {
  const type = document.getElementById('feedbackType').value;
  const feedbackId = document.getElementById('feedbackId').textContent;
  const title = `[${getTypeLabel(type)}] ${feedbackId}`;
  const body = buildFeedbackText();
  const params = new URLSearchParams({ title, body });
  return `${FEEDBACK_ISSUE_URL}?${params.toString()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  currentLanguage = await EWI18n.applyDocument();
  const manifest = chrome.runtime.getManifest();
  const feedbackId = await getFeedbackId();
  const settings = await getSettings();

  document.getElementById('feedbackId').textContent = feedbackId;
  document.getElementById('extensionVersion').textContent = manifest.version;
  document.getElementById('apiProvider').textContent = settings.apiProvider || 'gemini';

  document.getElementById('openIssue').addEventListener('click', () => {
    const message = document.getElementById('message').value.trim();
    if (!message) {
      document.getElementById('status').textContent = text('feedbackMessageRequired');
      return;
    }
    chrome.tabs.create({ url: buildIssueUrl() });
  });

  document.getElementById('copyFeedback').addEventListener('click', async () => {
    await navigator.clipboard.writeText(buildFeedbackText());
    document.getElementById('status').textContent = text('feedbackCopied');
  });
});
