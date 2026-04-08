import { describe, expect, test } from 'bun:test'
import { adaptOpenAIResponsesStreamToAnthropic } from '../responsesStreamAdapter.js'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs'

function mockStream(
  events: ResponseStreamEvent[],
): AsyncIterable<ResponseStreamEvent> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (i >= events.length) return { done: true, value: undefined }
          return { done: false, value: events[i++] }
        },
      }
    },
  }
}

async function collect(events: ResponseStreamEvent[]) {
  const result: any[] = []
  for await (const event of adaptOpenAIResponsesStreamToAnthropic(
    mockStream(events),
    'gpt-5.4',
  )) {
    result.push(event)
  }
  return result
}

describe('adaptOpenAIResponsesStreamToAnthropic', () => {
  test('maps function_call events to tool_use blocks', async () => {
    const events = await collect([
      {
        type: 'response.created',
        sequence_number: 0,
        response: { id: 'resp_1' },
      } as any,
      {
        type: 'response.output_item.added',
        sequence_number: 1,
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'bash',
          arguments: '',
          status: 'in_progress',
        },
      } as any,
      {
        type: 'response.function_call_arguments.delta',
        sequence_number: 2,
        output_index: 0,
        item_id: 'fc_1',
        delta: '{"command":"ls"}',
      } as any,
      {
        type: 'response.output_item.done',
        sequence_number: 3,
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'bash',
          arguments: '{"command":"ls"}',
          status: 'completed',
        },
      } as any,
      {
        type: 'response.completed',
        sequence_number: 4,
        response: {
          usage: { output_tokens: 12 },
        },
      } as any,
    ])

    expect(events[0].type).toBe('message_start')
    expect(events[1].type).toBe('content_block_start')
    expect(events[1].content_block).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'bash',
      input: {},
    })
    expect(events[2].delta.partial_json).toBe('{"command":"ls"}')
    expect(events[3].type).toBe('content_block_stop')

    const messageDelta = events.find(e => e.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
  })

  test('maps output_text events to text blocks', async () => {
    const events = await collect([
      {
        type: 'response.created',
        sequence_number: 0,
        response: { id: 'resp_1' },
      } as any,
      {
        type: 'response.output_item.added',
        sequence_number: 1,
        output_index: 0,
        item: {
          type: 'message',
          id: 'msg_1',
          content: [],
          role: 'assistant',
          status: 'in_progress',
        },
      } as any,
      {
        type: 'response.content_part.added',
        sequence_number: 2,
        output_index: 0,
        item_id: 'msg_1',
        content_index: 0,
        part: {
          type: 'output_text',
          text: '',
          annotations: [],
          logprobs: [],
        },
      } as any,
      {
        type: 'response.output_text.delta',
        sequence_number: 3,
        output_index: 0,
        item_id: 'msg_1',
        content_index: 0,
        delta: 'hello',
      } as any,
      {
        type: 'response.content_part.done',
        sequence_number: 4,
        output_index: 0,
        item_id: 'msg_1',
        content_index: 0,
        part: {
          type: 'output_text',
          text: 'hello',
          annotations: [],
          logprobs: [],
        },
      } as any,
      {
        type: 'response.completed',
        sequence_number: 5,
        response: {
          usage: { output_tokens: 5 },
        },
      } as any,
    ])

    const blockStart = events.find(e => e.type === 'content_block_start')
    expect(blockStart.content_block.type).toBe('text')

    const delta = events.find(
      e =>
        e.type === 'content_block_delta' &&
        e.delta.type === 'text_delta',
    )
    expect(delta.delta.text).toBe('hello')

    const messageDelta = events.find(e => e.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('end_turn')
  })
})
