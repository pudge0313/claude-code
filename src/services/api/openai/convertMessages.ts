import type {
  BetaContentBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat/completions/completions.mjs'
import type {
  EasyInputMessage,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseInputText,
} from 'openai/resources/responses/responses.mjs'
import type { AssistantMessage, UserMessage } from '../../../types/message.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'

/**
 * Convert internal (UserMessage | AssistantMessage)[] to OpenAI-format messages.
 *
 * Key conversions:
 * - system prompt → role: "system" message prepended
 * - tool_use blocks → tool_calls[] on assistant message
 * - tool_result blocks → role: "tool" messages
 * - thinking blocks → silently dropped
 * - cache_control → stripped
 */
export function anthropicMessagesToOpenAI(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []

  // Prepend system prompt as system message
  const systemText = systemPromptToText(systemPrompt)
  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    } satisfies ChatCompletionSystemMessageParam)
  }

  for (const msg of messages) {
    switch (msg.type) {
      case 'user':
        result.push(...convertInternalUserMessage(msg))
        break
      case 'assistant':
        result.push(...convertInternalAssistantMessage(msg))
        break
      default:
        break
    }
  }

  return result
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt
    .filter(Boolean)
    .join('\n\n')
}

function makeResponsesMessage(
  role: EasyInputMessage['role'],
  content: string,
): EasyInputMessage {
  return {
    type: 'message',
    role,
    content,
  }
}

function convertInternalUserMessage(
  msg: UserMessage,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    result.push({
      role: 'user',
      content,
    } satisfies ChatCompletionUserMessageParam)
  } else if (Array.isArray(content)) {
    const textParts: string[] = []
    const toolResults: BetaToolResultBlockParam[] = []

    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block)
      } else if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'tool_result') {
        toolResults.push(block as BetaToolResultBlockParam)
      }
      // Skip image, document, thinking, cache_edits, etc.
    }

    if (textParts.length > 0) {
      result.push({
        role: 'user',
        content: textParts.join('\n'),
      } satisfies ChatCompletionUserMessageParam)
    }

    for (const tr of toolResults) {
      result.push(convertToolResult(tr))
    }
  }

  return result
}

function convertToolResult(
  block: BetaToolResultBlockParam,
): ChatCompletionToolMessageParam {
  let content: string
  if (typeof block.content === 'string') {
    content = block.content
  } else if (Array.isArray(block.content)) {
    content = block.content
      .map(c => {
        if (typeof c === 'string') return c
        if ('text' in c) return c.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } else {
    content = ''
  }

  return {
    role: 'tool',
    tool_call_id: block.tool_use_id,
    content,
  } satisfies ChatCompletionToolMessageParam
}

function convertToolResultToResponses(
  block: BetaToolResultBlockParam,
): ResponseInputItem {
  let content: string
  if (typeof block.content === 'string') {
    content = block.content
  } else if (Array.isArray(block.content)) {
    content = block.content
      .map(c => {
        if (typeof c === 'string') return c
        if ('text' in c) return c.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } else {
    content = ''
  }

  return {
    type: 'function_call_output',
    call_id: block.tool_use_id,
    output: content,
  }
}

function convertInternalAssistantMessage(
  msg: AssistantMessage,
): ChatCompletionMessageParam[] {
  const content = msg.message.content

  if (typeof content === 'string') {
    return [
      {
        role: 'assistant',
        content,
      } satisfies ChatCompletionAssistantMessageParam,
    ]
  }

  if (!Array.isArray(content)) {
    return [
      {
        role: 'assistant',
        content: '',
      } satisfies ChatCompletionAssistantMessageParam,
    ]
  }

  const textParts: string[] = []
  const toolCalls: NonNullable<ChatCompletionAssistantMessageParam['tool_calls']> = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
    } else if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      const tu = block as BetaToolUseBlock
      toolCalls.push({
        id: tu.id,
        type: 'function',
        function: {
          name: tu.name,
          arguments:
            typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input),
        },
      })
    }
    // Skip thinking, redacted_thinking, server_tool_use, etc.
  }

  const result: ChatCompletionAssistantMessageParam = {
    role: 'assistant',
    content: textParts.length > 0 ? textParts.join('\n') : null,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
  }

  return [result]
}

function convertInternalUserMessageToResponses(
  msg: UserMessage,
): ResponseInputItem[] {
  const result: ResponseInputItem[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    result.push(makeResponsesMessage('user', content))
    return result
  }

  if (!Array.isArray(content)) {
    return result
  }

  const textParts: string[] = []
  const toolResults: BetaToolResultBlockParam[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
    } else if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_result') {
      toolResults.push(block as BetaToolResultBlockParam)
    }
  }

  if (textParts.length > 0) {
    result.push(makeResponsesMessage('user', textParts.join('\n')))
  }

  for (const tr of toolResults) {
    result.push(convertToolResultToResponses(tr))
  }

  return result
}

function convertInternalAssistantMessageToResponses(
  msg: AssistantMessage,
): ResponseInputItem[] {
  const result: ResponseInputItem[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    result.push(makeResponsesMessage('assistant', content))
    return result
  }

  if (!Array.isArray(content)) {
    return result
  }

  const textParts: string[] = []
  const toolCalls: ResponseFunctionToolCall[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
    } else if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      const tu = block as BetaToolUseBlock
      toolCalls.push({
        type: 'function_call',
        call_id: tu.id,
        name: tu.name,
        arguments:
          typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input),
      })
    }
  }

  if (textParts.length > 0) {
    result.push(makeResponsesMessage('assistant', textParts.join('\n')))
  }

  result.push(...toolCalls)
  return result
}

/**
 * Convert internal conversation history to Responses API input items.
 *
 * We model prior assistant tool calls and user tool results explicitly as
 * function_call / function_call_output items so GPT-5 can continue tool loops
 * statelessly without relying on previous_response_id support from a gateway.
 */
export function anthropicMessagesToOpenAIResponses(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): {
  input: ResponseInputItem[]
  instructions?: string
} {
  const input: ResponseInputItem[] = []

  for (const msg of messages) {
    switch (msg.type) {
      case 'user':
        input.push(...convertInternalUserMessageToResponses(msg))
        break
      case 'assistant':
        input.push(...convertInternalAssistantMessageToResponses(msg))
        break
      default:
        break
    }
  }

  const instructions = systemPromptToText(systemPrompt)
  return {
    input,
    ...(instructions ? { instructions } : {}),
  }
}
