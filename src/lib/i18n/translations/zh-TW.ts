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
  Save: '儲存',
  Edit: '編輯',
  Add: '新增',
  Create: '建立',
  Discard: '捨棄',
  Continue: '繼續',
  Delete: '刪除',
  Settings: '設定',
  'Contact Us': '聯絡我們',
  'Unknown error': '未知錯誤',
  at: '於',

  // Header & Search
  'Search gratitude logs...': '搜尋感恩日誌...',
  'Start typing to search your gratitude logs': '開始輸入以搜尋您的感恩日誌',
  'Search failed': '搜尋失敗',
  'No results': '無搜尋結果',

  // Gratitude
  'What are you grateful for today?': '今天您有什麼值得感恩的？',
  'What were you grateful for yesterday?': '昨天您有什麼值得感恩的？',
  'What are you grateful for?': '您有什麼值得感恩的？',
  'Failed to load entries': '無法載入紀錄',
  'I was grateful for': '我感恩',

  // Date Entries
  'Loading...': '載入中...',
  'No entries for this date': '此日期無紀錄',
  'Create Entry': '新增紀錄',
  'Something went wrong. Creating new entry.': '發生錯誤。正在建立新紀錄。',

  // Gratitude Entry
  'Delete Entry?': '刪除紀錄？',
  'Clearing the text will delete this entry entirely.': '清除文字將會完全刪除此紀錄。',
  'This entry will be permanently deleted.': '此紀錄將被永久刪除。',
  'Leave without saving?': '離開而不儲存？',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    '您的紀錄尚未儲存。您想繼續編輯還是捨棄？',
  'Keep Editing': '繼續編輯',

  'Pick any date': '選擇任意日期',
  'Select date': '選擇日期',
  Mood: '心情',
  Photo: '照片',
  Voice: '語音',

  'Title (optional)': '標題（選填）',
  // Moods
  Amazing: '棒極了',
  Happy: '開心',
  Okay: '還可以',
  Sad: '難過',
  Awful: '糟糕',
  'How are you feeling?': '您感覺如何？',
  'Feeling Amazing': '感覺棒極了',
  'Feeling Happy': '感覺很開心',
  'Feeling Okay': '感覺還可以',
  'Feeling Sad': '感覺難過',
  'Feeling Awful': '感覺很糟',
  'Add tags...': '新增標籤...',
  'Entry saved successfully': '紀錄儲存成功',
  'Failed to save entry': '無法儲存紀錄',
  'Failed to delete entry': '無法刪除紀錄',
  'Tag already exists': '標籤已存在',
  'Tag created': '標籤已建立',
  'Failed to create tag': '無法建立標籤',
  'Tag updated': '標籤已更新',
  'Failed to update tag': '無法更新標籤',
  'Tag deleted': '標籤已刪除',
  'Failed to delete tag': '無法刪除標籤',

  // Tags
  Tag: '標籤',
  Tags: '標籤',
  'Tag name': '標籤名稱',
  'Add a Tag': '新增一個標籤',
  'Create New Tag': '建立新標籤',
  'New tag name...': '新標籤名稱...',
  'No tags yet': '尚無標籤',
  'Create your first tag': '建立您的第一個標籤',
  'Edit Tag': '編輯標籤',
  'Delete Tag': '刪除標籤',
  'Are you sure you want to delete the tag?': '您確定要刪除此標籤嗎？',

  // Milestones
  'days of gratitude': '感恩天數',

  // Settings
  Language: '語言',
  'Select Language': '選擇語言',
  'Device Default': '裝置預設',
  'Restart Required': '需要重新啟動',
  'Language change requires app restart. Proceed?':
    '更換語言需要重新啟動應用程式。是否繼續？',
  Proceed: '繼續',
  'Reload App': '重新載入應用程式',

  // Settings - Notifications
  Notifications: '通知',
  'Daily Reminder': '每日提醒',
  'Daily reminder notifications are on': '每日提醒通知已開啟',
  'Daily reminder notifications are off': '每日提醒通知已關閉',
  'Adjust Reminder Time': '調整提醒時間',
  'Change your daily reminder time': '變更您的每日提醒時間',

  // Settings - Appearance
  Appearance: '外觀',
  Theme: '主題',
  'Choose from over 40 different themes and color schemes':
    '從 40 多種不同的主題和配色方案中選擇',
  'Timeline Entry Length': '時間軸紀錄長度',
  'Number of lines shown in the timeline': '時間軸中顯示的行數。點選紀錄可查看完整文字',
  'Show Timeline Borders': '顯示時間軸邊框',
  'Show the borders in the timeline': '顯示時間軸中的邊框',
  'Hide the borders in the timeline': '隱藏時間軸中的邊框',
  'Inspirational Quotes': '勵志名言',
  'Gratitude quotes will be shown on entry page': '感恩名言將顯示於紀錄頁面',
  'Date Style': '日期樣式',
  'Date includes day of the week': '日期包含星期',
  'First Day of Week': '每週的第一天',
  'Set the first day of the week in the calendar view': '設定日曆視圖中每週的第一天',

  // Settings - Security
  Security: '安全性',
  'Unlock Tackbok': '解鎖塔克博克',
  'Lock with biometric scanner if supported': '若裝置支援，使用生物辨識鎖定',

  // Settings - Backup & Restore
  'Backup & Restore': '備份與還原',
  'Google Drive Backup': 'Google 雲端硬碟備份',
  'Automatically back up your entries with Google Drive':
    '登入您的 Google 雲端硬碟帳號以自動備份您的紀錄',
  'Backup Frequency': '備份頻率',
  Daily: '每日',
  Weekly: '每週',
  'On Every Change': '每次變更時',
  'Export to CSV': '匯出為 CSV',
  'Full backup of entries and tags': '完整備份紀錄和標籤',
  'Import Entries from CSV': '從 CSV 匯入紀錄',
  'Restore from a Tackbok backup file': '從塔克博克備份檔案還原',
  'Import from Presently App': '從 Presently 應用程式匯入',
  'Import entries from a Presently CSV export': '從 Presently CSV 匯出檔匯入紀錄',
  'Import from Presently?': '從 Presently 匯入？',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    '這將從 Presently 應用程式 CSV 檔案匯入紀錄。重複的紀錄將被略過。',
  'Entries exported successfully': '紀錄匯出成功',
  'Export failed': '匯出失敗',
  importedCount: '已匯入 {count} 筆紀錄',
  'Import failed': '匯入失敗',
  'Importing entries...': '正在匯入紀錄...',
  'Are you sure you want to import?': '您確定要匯入嗎？',
  'Imported data could overwrite existing entries.': '匯入的資料可能會覆蓋現有的紀錄。',
  Import: '匯入',

  // Settings - App Information
  'App Information': '應用程式資訊',
  FAQ: '常見問題',
  'Read frequently asked questions': '閱讀塔克博克的常見問題',
  'Share Tackbok': '分享塔克博克',
  'Share the app with friends and family': '喜歡塔克博克嗎？與您的親友分享此應用程式',
  'Privacy Policy': '隱私權政策',
  'Read our privacy policy': '閱讀塔克博克的隱私權政策',
  'Terms & Conditions': '條款與條件',
  'Read our terms and conditions': '閱讀我們的條款與條件',
  Analytics: '分析資料收集',
  'Collecting anonymized analytics to help diagnose problems':
    '塔克博克收集匿名分析資訊以協助診斷問題並監控趨勢',
  Version: '版本',

  // Settings - Danger Zone
  'Danger Zone': '危險區域',
  'Delete All Data': '刪除所有資料',
  'Permanently delete all your entries': '永久刪除您的所有紀錄',
  'Delete all data?': '刪除所有資料？',
  'This action cannot be undone. All your entries will be permanently deleted.':
    '此動作無法復原。您的所有紀錄將被永久刪除。',
  'All data deleted': '所有資料已刪除',
  'Delete failed': '刪除失敗',

  // Time Picker
  'Select Time': '選擇時間',

  // Date Picker
  Today: '今天',
  Yesterday: '昨天',
  'Select Date': '選擇日期',
  'Has entry': '有紀錄',
  Selected: '已選擇',
  'Previous month': '上個月',
  'Next month': '下個月',
  'Select month': '選擇月份',
  'Select year': '選擇年份',
  Sun: '週日',
  Mon: '週一',
  Tue: '週二',
  Wed: '週三',
  Thu: '週四',
  Fri: '週五',
  Sat: '週六',
  Sunday: '星期日',
  Monday: '星期一',
  Tuesday: '星期二',
  Wednesday: '星期三',
  Thursday: '星期四',
  Friday: '星期五',
  Saturday: '星期六',
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

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.short': '{year}年{month}{day}日',
  'dateFormat.full': '{year}年{month}{day}日 {weekday}',
};
