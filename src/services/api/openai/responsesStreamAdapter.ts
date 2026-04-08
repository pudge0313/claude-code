import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs'
import { randomUUID } from 'crypto'

type OpenBlock =
  | { kind: 'tool_use'; index: number }
  | { kind: 'text'; index: number }

/**
 * Adapt a Responses API event stream into Anthropic beta message stream events.
 *
 * This path is primarily used for GPT-5-class OpenAI-compatible models whose
 * gateways support `/v1/responses` more reliably than `chat.completions` with
 * streaming tool calls.
 */
export async function* adaptOpenAIResponsesStreamToAnthropic(
  stream: AsyncIterable<ResponseStreamEvent>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const openBlocks = new Map<string, OpenBlock>()
  const emittedUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  let started = false
  let currentContentIndex = -1
  let lastStopReason: 'end_turn' | 'tool_use' = 'end_turn'

  for await (const event of stream) {
    switch (event.type) {
      case 'response.created': {
        if (started) break
        started = true
        yield {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: emittedUsage,
          },
        } as BetaRawMessageStreamEvent
        break
      }

      case 'response.output_item.added': {
        if (event.item.type === 'function_call') {
          currentContentIndex++
          openBlocks.set(event.item.id, {
            kind: 'tool_use',
            index: currentContentIndex,
          })
          lastStopReason = 'tool_use'

          yield {
            type: 'content_block_start',
            index: currentContentIndex,
            content_block: {
              type: 'tool_use',
              id: event.item.call_id,
              name: event.item.name,
              input: {},
            },
          } as BetaRawMessageStreamEvent
        }
        break
      }

      case 'response.function_call_arguments.delta': {
        const block = openBlocks.get(event.item_id)
        if (!block || block.kind !== 'tool_use') break

        yield {
          type: 'content_block_delta',
          index: block.index,
          delta: {
            type: 'input_json_delta',
            partial_json: event.delta,
          },
        } as BetaRawMessageStreamEvent
        break
      }

      case 'response.content_part.added': {
        if (event.part.type !== 'output_text') break

        currentContentIndex++
        const key = `${event.item_id}:${event.content_index}`
        openBlocks.set(key, {
          kind: 'text',
          index: currentContentIndex,
        })
        lastStopReason = 'end_turn'

        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: {
            type: 'text',
            text: '',
          },
        } as BetaRawMessageStreamEvent
        break
      }

      case 'response.output_text.delta': {
        const key = `${event.item_id}:${event.content_index}`
        const block = openBlocks.get(key)
        if (!block || block.kind !== 'text') break

        yield {
          type: 'content_block_delta',
          index: block.index,
          delta: {
            type: 'text_delta',
            text: event.delta,
          },
        } as BetaRawMessageStreamEvent
        break
      }

      case 'response.output_item.done': {
        if (event.item.type !== 'function_call') break
        const block = openBlocks.get(event.item.id)
        if (!block || block.kind !== 'tool_use') break

        yield {
          type: 'content_block_stop',
          index: block.index,
        } as BetaRawMessageStreamEvent
        openBlocks.delete(event.item.id)
        break
      }

      case 'response.content_part.done': {
        if (event.part.type !== 'output_text') break
        const key = `${event.item_id}:${event.content_index}`
        const block = openBlocks.get(key)
        if (!block || block.kind !== 'text') break

        yield {
          type: 'content_block_stop',
          index: block.index,
        } as BetaRawMessageStreamEvent
        openBlocks.delete(key)
        break
      }

      case 'response.completed': {
        const usage = event.response.usage
        yield {
          type: 'message_delta',
          delta: {
            stop_reason: lastStopReason,
            stop_sequence: null,
          },
          usage: {
            output_tokens: usage?.output_tokens ?? 0,
          },
        } as BetaRawMessageStreamEvent

        yield {
          type: 'message_stop',
        } as BetaRawMessageStreamEvent
        break
      }

      case 'response.failed':
      case 'error': {
        throw new Error(
          'error' in event && event.error?.message
            ? event.error.message
            : 'OpenAI Responses API stream failed',
        )
      }
    }
  }
}
