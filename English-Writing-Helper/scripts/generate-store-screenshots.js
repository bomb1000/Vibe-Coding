const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'store-listing', 'screenshots');
const sourceDir = path.join(outputDir, 'source');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const cases = [
  {
    locale: 'en',
    outlet: 'Global Ledger',
    section: 'Business',
    date: 'Wednesday, April 29, 2026',
    title: 'Company teams prepare for a cross-border product launch',
    source:
      'The product team will meet with partners in Singapore next week to review the launch timeline, discuss customer feedback, and prepare a clearer English announcement for international users.',
    translation:
      'The product team will meet with partners in Singapore next week to review the launch timeline, discuss customer feedback, and prepare a clearer English announcement for international users.',
    sidebarTitle: 'English writing',
    copyButton: 'Copy translation',
    shortcut: 'Shortcut: Ctrl+Shift+S',
  },
  {
    locale: 'zh_TW',
    outlet: 'Taiwan Daily',
    section: '科技',
    date: '2026年4月29日 星期三',
    title: '新創團隊準備推出跨國產品更新',
    source:
      '產品團隊下週將與新加坡合作夥伴開會，檢查上線時程、整理使用者回饋，並準備一份更清楚的英文公告，讓海外使用者也能快速理解新功能。',
    translation:
      'The product team will meet with partners in Singapore next week to review the launch timeline, organize user feedback, and prepare a clearer English announcement so international users can quickly understand the new features.',
    sidebarTitle: '英文寫法',
    copyButton: '複製翻譯',
    shortcut: 'Shortcut: Ctrl+Shift+S',
  },
  {
    locale: 'ja',
    outlet: 'Nihon Times',
    section: 'ビジネス',
    date: '2026年4月29日 水曜日',
    title: 'スタートアップ、海外向け製品アップデートを準備',
    source:
      '製品チームは来週、シンガポールのパートナーと会議を行い、公開スケジュールを確認し、利用者からのフィードバックを整理して、海外ユーザーにも伝わりやすい英語の告知文を準備する。',
    translation:
      'The product team will meet with partners in Singapore next week to review the release schedule, organize user feedback, and prepare a clear English announcement that international users can easily understand.',
    sidebarTitle: '英文ライティング',
    copyButton: '翻訳をコピー',
    shortcut: 'ショートカット: Ctrl+Shift+S',
  },
  {
    locale: 'ko',
    outlet: 'Seoul Insight',
    section: '테크',
    date: '2026년 4월 29일 수요일',
    title: '스타트업, 해외 사용자를 위한 제품 업데이트 준비',
    source:
      '제품 팀은 다음 주 싱가포르 파트너들과 회의를 열어 출시 일정을 점검하고 사용자 피드백을 정리한 뒤, 해외 사용자도 쉽게 이해할 수 있는 영어 공지문을 준비할 예정이다.',
    translation:
      'The product team will meet with partners in Singapore next week to review the launch schedule, organize user feedback, and prepare an English announcement that international users can easily understand.',
    sidebarTitle: '영어 글쓰기',
    copyButton: '번역 복사',
    shortcut: '단축키: Ctrl+Shift+S',
  },
  {
    locale: 'es',
    outlet: 'Diario Global',
    section: 'Tecnología',
    date: 'Miércoles, 29 de abril de 2026',
    title: 'Una startup prepara una actualización de producto para usuarios internacionales',
    source:
      'El equipo de producto se reunirá la próxima semana con socios en Singapur para revisar el calendario de lanzamiento, ordenar los comentarios de usuarios y preparar un anuncio en inglés más claro para el público internacional.',
    translation:
      'The product team will meet with partners in Singapore next week to review the launch timeline, organize user feedback, and prepare a clearer English announcement for international users.',
    sidebarTitle: 'Redacción en inglés',
    copyButton: 'Copiar traducción',
    shortcut: 'Atajo: Ctrl+Shift+S',
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(item) {
  return `<!doctype html>
<html lang="${escapeHtml(item.locale)}">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1280px;
      height: 800px;
      overflow: hidden;
      color: #1f2937;
      background: #f7f4ff;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .frame {
      position: relative;
      width: 1280px;
      height: 800px;
      background: #fff;
      border: 1px solid #ded8ec;
      box-shadow: inset 0 0 0 1px #f5f0ff;
    }
    .browser {
      height: 74px;
      border-bottom: 1px solid #d2d6df;
      background: linear-gradient(#fbfbfd, #eef1f7);
      padding: 14px 26px 0;
    }
    .dots { display: flex; gap: 8px; margin-bottom: 12px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .red { background: #ff625c; } .yellow { background: #ffbd44; } .green { background: #00ca4e; }
    .address {
      width: 760px;
      height: 26px;
      border-radius: 13px;
      background: #fff;
      border: 1px solid #cfd6e4;
      margin-left: 120px;
      margin-top: -24px;
    }
    .page { display: flex; height: 726px; }
    .share {
      width: 88px;
      padding-top: 210px;
      color: #7a8493;
      text-align: center;
      font-size: 22px;
      line-height: 52px;
    }
    .article {
      width: 740px;
      padding: 56px 36px;
    }
    .brand {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 0;
      color: #7547d8;
      margin-bottom: 24px;
    }
    .section {
      display: inline-block;
      color: #7258a8;
      font-size: 15px;
      font-weight: 700;
      background: #efe8ff;
      border-radius: 999px;
      padding: 7px 14px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 34px;
      line-height: 1.22;
      letter-spacing: 0;
      color: #111827;
    }
    .date {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 26px;
    }
    .highlight {
      display: inline;
      font-size: 24px;
      line-height: 1.52;
      color: #fff;
      background: #3478f6;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      padding: 4px 6px;
    }
    .image {
      width: 610px;
      height: 208px;
      margin-top: 32px;
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,0) 34%),
        linear-gradient(120deg, #6d7f95, #b8c2d4 42%, #e8d9c9);
      position: relative;
      overflow: hidden;
    }
    .image::before {
      content: "";
      position: absolute;
      inset: 70px 0 0;
      background: linear-gradient(90deg, #26364a 0 28%, #f3d5a6 28% 44%, #795f55 44% 62%, #d8b88f 62%);
      opacity: .8;
    }
    .image::after {
      content: "";
      position: absolute;
      left: 52px;
      top: 34px;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 36%, #f0c1a8 0 28%, #91705f 29% 44%, transparent 45%),
        linear-gradient(#5d6b7f, #344054);
      box-shadow: 210px 20px 0 -28px rgba(255,255,255,.45), 350px 50px 0 -38px rgba(255,255,255,.35);
    }
    .sidebar {
      position: absolute;
      right: 44px;
      top: 175px;
      width: 350px;
      height: 330px;
      border-radius: 12px;
      border: 2px solid #a77ed8;
      background: #e8dcff;
      box-shadow: 0 14px 36px rgba(48, 25, 52, .22);
      overflow: hidden;
    }
    .sidebar-header {
      padding: 18px 20px 12px;
      color: #2f1840;
      font-size: 20px;
      font-weight: 800;
      border-bottom: 1px solid rgba(80, 52, 117, .16);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gear {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #fff;
      color: #7a4eb3;
      display: grid;
      place-items: center;
      font-size: 21px;
      font-weight: 900;
    }
    .controls {
      height: 46px;
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 0 20px;
      border-bottom: 1px solid rgba(80, 52, 117, .16);
      color: #342044;
      font-size: 18px;
      font-weight: 650;
    }
    .controls .shortcut {
      margin-left: auto;
      font-size: 13px;
      font-weight: 500;
      color: #6e5d7b;
    }
    .copy {
      margin: 14px 14px 10px;
      height: 42px;
      border-radius: 6px;
      background: #a276d8;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 16px;
      font-weight: 800;
    }
    .result {
      margin: 0 14px;
      height: 178px;
      background: #f8f4ff;
      padding: 14px 16px;
      color: #111827;
      font-size: 16px;
      line-height: 1.45;
      overflow: hidden;
    }
    .resize {
      position: absolute;
      right: 8px;
      bottom: 6px;
      color: #9a8ba8;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="browser">
      <div class="dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
      <div class="address"></div>
    </div>
    <div class="page">
      <aside class="share">○<br>f<br>↗<br>✉</aside>
      <main class="article">
        <div class="brand">${escapeHtml(item.outlet)}</div>
        <div class="section">${escapeHtml(item.section)}</div>
        <h1>${escapeHtml(item.title)}</h1>
        <div class="date">${escapeHtml(item.date)}</div>
        <p><span class="highlight">${escapeHtml(item.source)}</span></p>
        <div class="image"></div>
      </main>
    </div>
    <aside class="sidebar">
      <div class="sidebar-header">${escapeHtml(item.sidebarTitle)} <span class="gear">⚙</span></div>
      <div class="controls"><span>A-</span><span>A+</span><span class="shortcut">${escapeHtml(item.shortcut)}</span></div>
      <div class="copy">${escapeHtml(item.copyButton)}</div>
      <div class="result">${escapeHtml(item.translation)}</div>
      <div class="resize">◢</div>
    </aside>
  </div>
</body>
</html>`;
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

for (const item of cases) {
  const htmlPath = path.join(sourceDir, `${item.locale}.html`);
  const pngPath = path.join(outputDir, `${item.locale}-store-screenshot-1280x800.png`);
  fs.writeFileSync(htmlPath, renderHtml(item), 'utf8');
  execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,800',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'inherit' });
  console.log(`Wrote ${pngPath}`);
}
