import type { Translations } from '../types';

/**
 * Traditional Chinese (zh-TW) translations
 * Contains translations for all UI strings used in the application
 */
export const zhTW: Translations = {
  // Common
  Tackbok: '塔克博克',
  Cancel: '取消',
  Done: '完成',
  Save: '保存',
  Continue: '繼續',
  Delete: '刪除',
  Settings: '設定',
  'Contact Us': '聯絡我們',
  'Unknown error': '未知錯誤',

  // Header & Search
  'Search gratitude logs...': '搜尋感恩日誌...',
  'Start typing to search your gratitude logs': '開始輸入以搜尋您的感恩日誌',
  'Search failed': '搜尋失敗',
  'No results': '無結果',

  // Gratitude
  'What are you grateful for today?': '今天你有什麼值得感恩的？',
  'What were you grateful for yesterday?': '昨天你有什麼值得感恩的？',
  'What are you grateful for?': '你有什麼值得感恩的？',
  'Failed to load entries': '載入條目失敗',
  'I was grateful for': '我感恩',

  // Gratitude Entry
  'Delete Entry?': '刪除條目？',
  'Clearing the text will delete this entry entirely.': '清除文字將完全刪除此條目。',
  'Are you sure you want to go back?': '你確定要返回嗎？',
  'Your entry is unsaved and your changes will be lost!':
    '您的條目未保存，更改將會丟失！',

  // Milestones
  'days of gratitude': '感恩天數',

  // Settings
  Language: '語言',
  'Select Language': '選擇語言',
  'Device Default': '裝置預設',
  'Restart Required': '需要重新啟動',
  'Language change requires app restart. Proceed?':
    '更改語言需要重新啟動應用程式。是否繼續？',
  Proceed: '繼續',

  // Settings - Notifications
  Notifications: '通知',
  'Daily Reminder': '每日提醒',
  'Daily reminder notifications are on': '每日提醒通知已開啟',
  'Daily reminder notifications are off': '每日提醒通知已關閉',
  'Adjust Reminder Time': '調整提醒時間',
  'Change your daily reminder time': '更改您的每日提醒時間',

  // Settings - Appearance
  Appearance: '外觀',
  Theme: '主題',
  'Choose from over 40 different themes and color schemes':
    '從40多種不同的主題和配色方案中選擇',
  'Timeline Entry Length': '時間軸條目長度',
  'Number of lines shown in the timeline': '時間軸中顯示的行數。點擊條目可查看完整文字',
  'Inspirational Quotes': '勵志名言',
  'Gratitude quotes will be shown on entry page': '感恩名言將在條目頁面顯示',
  'Date Style': '日期樣式',
  'Date includes day of the week': '日期包含星期幾',
  'First Day of Week': '一週的第一天',
  'Set the first day of the week in the calendar view': '設定日曆視圖中一週的第一天',
  Saturday: '星期六',
  Sunday: '星期日',
  Monday: '星期一',

  // Settings - Security
  Security: '安全',
  'Unlock Tackbok': '解鎖塔克博克',
  'Lock with biometric scanner if supported':
    '塔克博克可使用裝置的生物辨識掃描器鎖定（如果裝置支援）',

  // Settings - Backup & Restore
  'Backup & Restore': '備份與還原',
  'Google Drive Backup': 'Google Drive 備份',
  'Automatically back up your entries with Google Drive':
    '登入您的 Google Drive 帳戶以自動備份您的條目',
  'Backup Frequency': '備份頻率',
  Daily: '每天',
  Weekly: '每週',
  'On Every Change': '每次更改時',
  'Export to CSV': '匯出到 CSV',
  'Manually export your entries to CSV format': '手動將您的條目以 CSV 格式匯出到裝置',
  'Import from Backup': '從備份匯入',
  'Select a backed up CSV file to import': '選擇要匯入的備份 CSV 檔案',
  'Entries exported successfully': '條目匯出成功',
  'Export failed': '匯出失敗',
  Imported: '已匯入',
  entries: '條目',
  'Import failed': '匯入失敗',
  'Are you sure you want to import?': '您確定要匯入嗎？',
  'Imported data could overwrite existing entries.': '匯入的資料可能會覆蓋現有條目。',
  Import: '匯入',

  // Settings - App Information
  'App Information': '應用程式資訊',
  FAQ: '常見問題',
  'Read frequently asked questions': '閱讀塔克博克的常見問題',
  'Share Tackbok': '分享塔克博克',
  'Share the app with friends and family':
    '喜歡塔克博克嗎？與您的朋友和家人分享這個應用程式',
  'Privacy Policy': '隱私權政策',
  'Read our privacy policy': '閱讀塔克博克的隱私權政策',
  'Terms & Conditions': '條款和條件',
  'Read our terms and conditions': '閱讀我們的條款和條件',
  Analytics: '分析數據收集',
  'Collecting anonymized analytics to help diagnose problems':
    '塔克博克正在收集匿名分析資訊以幫助診斷問題和監控趨勢',
  Version: '版本號',

  // Settings - Danger Zone
  'Danger Zone': '危險區域',
  'Delete All Data': '刪除所有資料',
  'Permanently delete all your entries': '永久刪除您的所有條目',
  'Delete all data?': '刪除所有資料？',
  'This action cannot be undone. All your entries will be permanently deleted.':
    '此操作無法撤銷。您的所有條目將被永久刪除。',
  'All data deleted': '所有資料已刪除',
  'Delete failed': '刪除失敗',

  // Date Picker
  'Select Date': '選擇日期',
  'Has entry': '有條目',
  Selected: '已選擇',
  Sun: '週日',
  Mon: '週一',
  Tue: '週二',
  Wed: '週三',
  Thu: '週四',
  Fri: '週五',
  Sat: '週六',
  January: '一月',
  February: '二月',
  March: '三月',
  April: '四月',
  May: '五月',
  June: '六月',
  July: '七月',
  August: '八月',
  September: '九月',
  October: '十月',
  November: '十一月',
  December: '十二月',
  JAN: '1月',
  FEB: '2月',
  MAR: '3月',
  APR: '4月',
  MAY: '5月',
  JUN: '6月',
  JUL: '7月',
  AUG: '8月',
  SEP: '9月',
  OCT: '10月',
  NOV: '11月',
  DEC: '12月',
};
