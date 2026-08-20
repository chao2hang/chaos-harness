/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` reads identically to `trigger.fallback` today and is
 * still a separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'command.description': '选择本会话使用的模型',
  'option.loadError': '目录加载失败：{message}',
  'trigger.fallback': '选择模型',
  'trigger.selectAria': '选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'menu.aria': '模型与请求参数',
  'menu.model': '模型',
  'menu.effort': '思维强度',
  'menu.contextWindow': '上下文窗口',
  'menu.maxTokens': '最大输出 Token',
  'menu.imageInput': '支持图片输入',
  'action.enable': '启用',
  'capacity.savedGlobally': '修改会立即用于本会话，并保存为该自定义模型的全局能力。',
  'capacity.readOnly': '这是模型声明的只读容量；只有显式配置的自定义模型可以修改。',
  'empty.capacity': '当前模型未提供容量信息。',
  'effort.providerDefault': 'Default',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失败：{message}',
  'notice.effortAdjusted': '当前模型不支持 {requested}，已切换到 {selected}',
  'action.reload': '重新加载',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'empty.models': '没有可用的模型。',
  'blocked.composer': '当前模型不可用，请先选择模型',
  'empty.efforts': '当前模型未提供推理等级。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model and request parameters',
  'menu.model': 'Model',
  'menu.effort': 'Reasoning effort',
  'menu.contextWindow': 'Context window',
  'menu.maxTokens': 'Maximum output tokens',
  'menu.imageInput': 'Accept image input',
  'action.enable': 'Enable',
  'capacity.savedGlobally': 'Changes apply to this conversation immediately and become this custom model’s global capability.',
  'capacity.readOnly': 'This model capacity is read-only; only explicitly configured custom models can be changed.',
  'empty.capacity': 'This model provides no capacity information.',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'notice.effortAdjusted': '{requested} is unavailable for this model; switched to {selected}',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'blocked.composer': 'This model is unavailable — select one to continue',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>
