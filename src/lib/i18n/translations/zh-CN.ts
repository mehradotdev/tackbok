import type { Translations } from '../types';

/**
 * Simplified Chinese (zh-CN) translations
 * Contains translations for all UI strings used in the application
 */
export const zhCN: Translations = {
  // Common
  Tackbok: '塔克博克',
  Cancel: '取消',
  Done: '完成',
  Save: '保存',
  Continue: '继续',
  Delete: '删除',
  Settings: '设置',
  'Contact Us': '联系我们',
  'Unknown error': '未知错误',

  // Header & Search
  'Search gratitude logs...': '搜索感恩日志...',
  'Start typing to search your gratitude logs': '开始输入以搜索您的感恩日志',
  'Search failed': '搜索失败',
  'No results': '无结果',

  // Gratitude
  'What are you grateful for today?': '今天你有什么值得感恩的？',
  'What were you grateful for yesterday?': '昨天你有什么值得感恩的？',
  'What are you grateful for?': '你有什么值得感恩的？',
  'Failed to load entries': '加载条目失败',
  'I was grateful for': '我感恩',

  // Gratitude Entry
  'Delete Entry?': '删除条目？',
  'Clearing the text will delete this entry entirely.': '清除文本将完全删除此条目。',
  'Are you sure you want to go back?': '你确定要返回吗？',
  'Your entry is unsaved and your changes will be lost!':
    '您的条目未保存，更改将会丢失！',

  // Milestones
  'days of gratitude': '感恩天数',

  // Settings
  Language: '语言',
  'Select Language': '选择语言',
  'Device Default': '设备默认',
  'Restart Required': '需要重启',
  'Language change requires app restart. Proceed?': '更改语言需要重启应用。是否继续？',
  Proceed: '继续',

  // Settings - Notifications
  Notifications: '通知',
  'Daily Reminder': '每日提醒',
  'Daily reminder notifications are on': '每日提醒通知已开启',
  'Daily reminder notifications are off': '每日提醒通知已关闭',
  'Adjust Reminder Time': '调整提醒时间',
  'Change your daily reminder time': '更改您的每日提醒时间',

  // Settings - Appearance
  Appearance: '外观',
  Theme: '主题',
  'Choose from over 40 different themes and color schemes':
    '从40多种不同的主题和配色方案中选择',
  'Timeline Entry Length': '时间线条目长度',
  'Number of lines shown in the timeline': '时间线中显示的行数。点击条目可查看完整文本',
  'Inspirational Quotes': '励志名言',
  'Gratitude quotes will be shown on entry page': '感恩名言将在条目页面显示',
  'Date Style': '日期样式',
  'Date includes day of the week': '日期包含星期几',
  'First Day of Week': '一周的第一天',
  'Set the first day of the week in the calendar view': '设置日历视图中一周的第一天',
  Saturday: '星期六',
  Sunday: '星期日',
  Monday: '星期一',

  // Settings - Security
  Security: '安全',
  'Unlock Tackbok': '解锁塔克博克',
  'Lock with biometric scanner if supported':
    '塔克博克可使用设备的生物识别扫描仪锁定（如果设备支持）',

  // Settings - Backup & Restore
  'Backup & Restore': '备份与恢复',
  'Google Drive Backup': 'Google Drive 备份',
  'Automatically back up your entries with Google Drive':
    '登录您的 Google Drive 账户以自动备份您的条目',
  'Backup Frequency': '备份频率',
  Daily: '每天',
  Weekly: '每周',
  'On Every Change': '每次更改时',
  'Export to CSV': '导出到 CSV',
  'Manually export your entries to CSV format': '手动将您的条目以 CSV 格式导出到设备',
  'Import from Backup': '从备份导入',
  'Select a backed up CSV file to import': '选择要导入的备份 CSV 文件',
  'Entries exported successfully': '条目导出成功',
  'Export failed': '导出失败',
  Imported: '已导入',
  entries: '条条目',
  'Import failed': '导入失败',
  'Are you sure you want to import?': '您确定要导入吗？',
  'Imported data could overwrite existing entries.': '导入的数据可能会覆盖现有条目。',
  Import: '导入',

  // Settings - App Information
  'App Information': '应用信息',
  FAQ: '常见问题',
  'Read frequently asked questions': '阅读塔克博克的常见问题',
  'Share Tackbok': '分享塔克博克',
  'Share the app with friends and family': '喜欢塔克博克吗？与您的朋友和家人分享这个应用',
  'Privacy Policy': '隐私政策',
  'Read our privacy policy': '阅读塔克博克的隐私政策',
  'Terms & Conditions': '条款和条件',
  'Read our terms and conditions': '阅读我们的条款和条件',
  Analytics: '分析数据收集',
  'Collecting anonymized analytics to help diagnose problems':
    '塔克博克正在收集匿名分析信息以帮助诊断问题和监控趋势',
  Version: '版本号',

  // Settings - Danger Zone
  'Danger Zone': '危险区域',
  'Delete All Data': '删除所有数据',
  'Permanently delete all your entries': '永久删除您的所有条目',
  'Delete all data?': '删除所有数据？',
  'This action cannot be undone. All your entries will be permanently deleted.':
    '此操作无法撤销。您的所有条目将被永久删除。',
  'All data deleted': '所有数据已删除',
  'Delete failed': '删除失败',

  // Date Picker
  'Select Date': '选择日期',
  'Has entry': '有条目',
  Selected: '已选择',
  Sun: '周日',
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
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
