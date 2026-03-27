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
  Edit: '编辑',
  Add: '添加',
  Create: '创建',
  Discard: '放弃',
  Continue: '继续',
  Delete: '删除',
  Remove: '移除',
  Close: '关闭',
  Play: '播放',
  Pause: '暂停',
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

  // Date Entries
  'Loading...': '加载中...',
  'No entries for this date': '此日期无条目',
  'Create Entry': '创建条目',
  'Something went wrong. Creating new entry.': '出了点问题。正在创建新条目。',

  // Gratitude Entry
  'Delete Entry?': '删除条目？',
  'Clearing the text will delete this entry entirely.': '清除文本将完全删除此条目。',
  'This entry will be permanently deleted.': '此条目将被永久删除。',
  'Leave without saving?': '不保存离开？',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    '您的条目未保存。您想继续编辑还是丢弃？',
  'Keep Editing': '继续编辑',

  'Pick any date': '选择任意日期',
  'Select date': '选择日期',
  Mood: '心情',
  Photo: '照片',
  'Add Photo': '添加照片',
  'Take Photo': '拍照',
  'Choose from Library': '从相册选择',
  'Maximum {count} photos per entry': '每条记录最多 {count} 张照片',
  'Maximum {count} voice memos per entry': '每条记录最多 {count} 条语音备忘录',
  'Camera Access Required': '需要相机访问权限',
  'Photo Library Access Required': '需要照片库访问权限',
  'Please enable camera access in your device settings to take photos.':
    '请在设备设置中启用相机访问权限以拍摄照片。',
  'Please enable photo library access in your device settings to select photos.':
    '请在设备设置中启用照片库访问权限以选择照片。',
  'Open Settings': '打开设置',
  Voice: '语音',
  'Microphone Access Required': '需要麦克风权限',
  'Please enable microphone access in your device settings to record voice memos.':
    '请在设备设置中启用麦克风权限以录制语音备忘录。',
  'Record Voice Note': '录制语音备忘录',
  'Tap the button below when ready.': '准备好后请点击下方按钮。',
  'Start Recording': '开始录音',
  'Recording Voice Note...': '正在录制语音备忘录...',
  'Stop Recording': '停止录音',
  'Voice Note Recorded': '语音备忘录已录制',
  'Tap on the play button to listen.': '点击播放按钮即可收听。',
  'Save Recording': '保存录音',
  'Record Again': '重新录制',

  'Title (optional)': '标题（可选）',
  // Moods
  Amazing: '棒极了',
  Happy: '很高兴',
  Okay: '还行',
  Sad: '难过',
  Awful: '很糟糕',
  'How are you feeling?': '你感觉如何？',
  'Feeling Amazing': '感觉棒极了',
  'Feeling Happy': '感觉很高兴',
  'Feeling Okay': '感觉还行',
  'Feeling Sad': '感觉难过',
  'Feeling Awful': '感觉很糟糕',
  'Add tags...': '添加标签...',
  'Entry saved successfully': '条目保存成功',
  'Failed to save entry': '保存条目失败',
  'Failed to add photos': '添加照片失败',
  'Failed to delete entry': '删除条目失败',
  'Tag already exists': '标签已存在',
  'Tag created': '标签已创建',
  'Failed to create tag': '创建标签失败',
  'Tag updated': '标签已更新',
  'Failed to update tag': '更新标签失败',
  'Tag deleted': '标签已删除',
  'Failed to delete tag': '删除标签失败',

  // Tags
  Tag: '标签',
  Tags: '标签',
  'Tag name': '标签名称',
  'Add a Tag': '添加标签',
  'Create New Tag': '创建新标签',
  'New tag name...': '新标签名称...',
  'No tags yet': '暂无标签',
  'Create your first tag': '创建您的第一个标签',
  'Edit Tag': '编辑标签',
  'Delete Tag': '删除标签',
  'Are you sure you want to delete the tag "{title}"?': '您确定要删除标签“{title}”吗？',

  // Milestones
  'days of gratitude': '感恩天数',

  // Settings
  Language: '语言',
  'Select Language': '选择语言',
  'Device Default': '设备默认',
  'Restart Required': '需要重启',
  'Language change requires app restart. Proceed?': '更改语言需要重启应用。是否继续？',
  Proceed: '继续',
  'Reload App': '重新加载应用',

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
  'Select a theme': '选择主题',
  'Choose from over 10 different themes and color schemes':
    '从10多种不同的主题和配色方案中选择',
  'Timeline Entry Length': '时间线条目长度',
  'Number of lines shown in the timeline': '时间线中显示的行数。点击条目可查看完整文本',
  'Show Timeline Borders': '显示时间线边框',
  'Show the borders in the timeline': '显示时间线中的边框',
  'Hide the borders in the timeline': '隐藏时间线中的边框',
  'Inspirational Quotes': '励志名言',
  'Gratitude quotes will be shown on entry page': '感恩名言将在条目页面显示',
  'Date Style': '日期样式',
  'Date includes day of the week': '日期包含星期几',
  'First Day of Week': '一周的第一天',
  'Set the first day of the week in the calendar view': '设置日历视图中一周的第一天',

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
  'Full backup of entries and tags': '完整备份条目和标签',
  'Import Entries from CSV': '从 CSV 导入条目',
  'Restore from a Tackbok backup file': '从塔克博克备份文件恢复',
  'Import from Presently App': '从 Presently 应用导入',
  'Import entries from a Presently CSV export': '从 Presently CSV 导出导入条目',
  'Import from Presently?': '从 Presently 导入？',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    '这将从 Presently 应用 CSV 文件导入条目。重复条目将被跳过。',
  'Entries exported successfully': '条目导出成功',
  'Export failed': '导出失败',
  importedCount: '已导入 {count} 条目',
  importedCountSingular: '已导入 {count} 条目',
  'Import failed': '导入失败',
  'Importing entries...': '正在导入条目...',
  'Are you sure you want to import?': '您确定要导入吗？',
  'This will import entries from a Tackbok backup file. Duplicate entries will be skipped.':
    '这将从塔克博克备份文件导入条目。重复条目将被跳过。',
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
  'Permanently delete all your entries, photos, and voice memos':
    '永久删除您的所有条目、照片和语音备忘录',
  'Delete all data?': '删除所有数据？',
  'This action cannot be undone. All your entries, photos, and voice memos will be permanently deleted.':
    '此操作无法撤销。您的所有条目、照片和语音备忘录将被永久删除。',
  'All data deleted': '所有数据已删除',
  'Delete failed': '删除失败',

  // Time Picker
  'Select Time': '选择时间',

  // Date Picker
  Today: '今天',
  Yesterday: '昨天',
  'Select Date': '选择日期',
  'Has entry': '有条目',
  Selected: '已选择',
  'Previous month': '上个月',
  'Next month': '下个月',
  'Select month': '选择月份',
  'Select year': '选择年份',
  Sun: '周日',
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
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
  'dateFormat.timeLabel': '{weekday} 于 {time}',
};
