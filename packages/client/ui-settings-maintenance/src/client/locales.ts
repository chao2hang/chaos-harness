/** Copy dictionaries for the System maintenance settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '系统维护',
  title: '系统维护',
  intro: '查看当前服务的运行状况，并在需要时重启 Web 服务。',
  status: '运行状况',
  'status.version': '版本',
  'status.cwd': '工作目录',
  'status.sessions': '活动会话',
  'status.offline': '未连接到服务。',
  'restart.title': '重启 Web 服务',
  'restart.description': '重启后，标记为“需重启生效”的设置、插件的增删，以及重新构建的代码都会生效。服务会用相同的启动参数重新拉起，地址保持不变。',
  'restart.action': '重启服务',
  'restart.unavailable': '当前部署无法自行重启：启动它的方式没有提供重启入口。',
  'restart.confirmTitle': '重启 Web 服务？',
  'restart.confirmSessions': '当前有 {count} 个活动会话，重启会立即中断它们正在进行的回合。',
  'restart.confirmIdle': '当前没有活动会话，重启只会断开浏览器连接。',
  'restart.acknowledge': '我知道重启会中断进行中的会话',
  'restart.cancel': '取消',
  'restart.confirm': '重启',
  'restart.pending': '正在重启，等待服务恢复…',
  'restart.done': '服务已重启，连接已恢复。',
  'restart.failed': '重启请求失败：{reason}',
} satisfies Record<string, string>

/** System maintenance locale key union. */
export type MaintenanceLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'System',
  title: 'System',
  intro: 'Review how this server is running, and restart it when a change needs a fresh process.',
  status: 'Status',
  'status.version': 'Version',
  'status.cwd': 'Working directory',
  'status.sessions': 'Active sessions',
  'status.offline': 'Not connected to the server.',
  'restart.title': 'Restart the web server',
  'restart.description': 'A restart applies settings marked as taking effect on restart, plugin additions and removals, and rebuilt code. The server comes back with the same launch arguments, on the same address.',
  'restart.action': 'Restart server',
  'restart.unavailable': 'This deployment cannot restart itself: the way it was launched offers no restart request.',
  'restart.confirmTitle': 'Restart the web server?',
  'restart.confirmSessions': '{count} sessions are active. Restarting interrupts whatever turn each one is running.',
  'restart.confirmIdle': 'No sessions are active, so a restart only drops this browser connection.',
  'restart.acknowledge': 'I understand that restarting interrupts running sessions',
  'restart.cancel': 'Cancel',
  'restart.confirm': 'Restart',
  'restart.pending': 'Restarting — waiting for the server to come back…',
  'restart.done': 'The server restarted and the connection is back.',
  'restart.failed': 'The restart request failed: {reason}',
} satisfies Record<MaintenanceLocaleKey, string>
