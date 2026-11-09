/** @type {import('tailwindcss').Config} */
export default {
  // 启用 class 模式暗色主题（修仙游戏默认以夜色暗黑修真国风为主）
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /**
       * 游戏主色板移植
       * 结合国风水墨与金丹仙道美学：
       * - primary: 金黄色系（代表灵力、功力、上品法宝、尊贵）
       * - secondary: 绯红朱砂系（代表气血、杀伐、决斗、危机）
       * - tertiary: 翡翠灵碧系（代表内力、回春、草药、仙宗）
       * - surface: 沉木玄青与深渊夜色（背景与容器底色）
       */
      colors: {
        // --- 错误与警告相关 ---
        'error': '#ffb4ab',
        'error-container': '#93000a',
        'on-error': '#690005',
        'on-error-container': '#ffdad6',

        // --- 主色调（金丹·流光·灵石黄） ---
        'primary': '#fdd385',
        'primary-container': '#dfb76c',
        'primary-fixed': '#ffdea5',
        'primary-fixed-dim': '#eac175',
        'on-primary': '#412d00',
        'on-primary-container': '#634703',
        'on-primary-fixed': '#271900',
        'on-primary-fixed-variant': '#5d4200',
        'inverse-primary': '#785917',

        // --- 次色调（朱砂·赤血·杀伐红） ---
        'secondary': '#ffb3ae',
        'secondary-container': '#8d1d20',
        'secondary-fixed': '#ffdad7',
        'secondary-fixed-dim': '#ffb3ae',
        'on-secondary': '#68000c',
        'on-secondary-container': '#ff9e98',
        'on-secondary-fixed': '#410004',
        'on-secondary-fixed-variant': '#8a1b1e',

        // --- 三级色调（碧玉·灵气·生机翠） ---
        'tertiary': '#b3e4c6',
        'tertiary-container': '#98c8ab',
        'tertiary-fixed': '#bceecf',
        'tertiary-fixed-dim': '#a1d1b4',
        'on-tertiary': '#063824',
        'on-tertiary-container': '#28553e',
        'on-tertiary-fixed': '#002112',
        'on-tertiary-fixed-variant': '#224f39',

        // --- 背景与界面容器（玄墨·夜空·古刹青灰） ---
        'background': '#0c141e',
        'on-background': '#dbe3f1',
        'surface': '#0c141e',
        'surface-dim': '#0c141e',
        'surface-bright': '#323a45',
        'surface-tint': '#eac175',
        'surface-variant': '#2d3540',
        'on-surface': '#dbe3f1',
        'on-surface-variant': '#d1c5b4',
        'inverse-surface': '#dbe3f1',
        'inverse-on-surface': '#29313c',

        // --- 细分层次容器底色（用于卡片、边栏、HUD层叠效果） ---
        'surface-container-lowest': '#070f18',
        'surface-container-low': '#141c26',
        'surface-container': '#18202a',
        'surface-container-high': '#232b35',
        'surface-container-highest': '#2d3540',

        // --- 边框与轮廓 ---
        'outline': '#9a8f7f',
        'outline-variant': '#4e4639',
      },

      /**
       * 圆角规范（保留原页面古风方正带微圆的修仙 UI 感）
       */
      borderRadius: {
        'DEFAULT': '0.25rem', // 4px
        'lg': '0.5rem',        // 8px
        'xl': '0.75rem',       // 12px
        'full': '9999px',
      },

      /**
       * 间距规范（精细化游戏 HUD 紧凑排版）
       */
      spacing: {
        'space-xs': '0.25rem',  // 4px
        'space-sm': '0.375rem', // 6px
        'space-md': '0.5rem',   // 8px
        'space-lg': '0.75rem',  // 12px
        'space-xl': '1rem',     // 16px
        'margin': '1rem',       // 16px
        'gutter': '0.75rem',    // 12px
      },

      /**
       * 字体族定义（正文与标题采用古风宋体 Serif，数据与操作标签采用清晰黑体 Sans）
       */
      fontFamily: {
        'headline-xl': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'headline-lg': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'headline-md': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'headline-sm': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'body-lg': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'body-md': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'body-sm': ['Noto Serif', 'STSong', 'SimSun', 'serif'],
        'label-lg': ['Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        'label-md': ['Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        'label-sm': ['Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        'data-metric': ['Noto Sans', 'Roboto', 'monospace', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
