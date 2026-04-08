import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.mjs'
import type {
  FunctionTool,
  ToolChoiceFunction,
  ToolChoiceOptions,
} from 'openai/resources/responses/responses.mjs'

/**
 * Convert Anthropic tool schemas to OpenAI function calling format.
 *
 * Anthropic: { name, description, input_schema }
 * OpenAI:    { type: "function", function: { name, description, parameters } }
 *
 * Anthropic-specific fields (cache_control, defer_loading, etc.) are stripped.
 */
export function anthropicToolsToOpenAI(
  tools: BetaToolUnion[],
): ChatCompletionTool[] {
  return tools
    .filter(tool => {
      // Only convert standard tools (skip server tools like computer_use, etc.)
      return tool.type === 'custom' || !('type' in tool) || tool.type !== 'server'
    })
    .map(tool => {
      // Handle the various tool shapes from Anthropic SDK
      const anyTool = tool as Record<string, unknown>
      const name = (anyTool.name as string) || ''
      const description = (anyTool.description as string) || ''
      const inputSchema = anyTool.input_schema as Record<string, unknown> | undefined

      return {
        type: 'function' as const,
        function: {
          name,
          description,
          parameters: inputSchema || { type: 'object', properties: {} },
        },
      } satisfies ChatCompletionTool
    })
}

function normalizeResponsesSchema(schema: unknown): unknown {
  if (schema == null || typeof schema !== 'object') {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map(item => normalizeResponsesSchema(item))
  }

  const normalized = { ...(schema as Record<string, unknown>) }
  const originalRequired = Array.isArray(normalized.required)
    ? normalized.required.filter((key): key is string => typeof key === 'string')
    : []
  const originalRequiredSet = new Set(originalRequired)

  if (
    normalized.properties &&
    typeof normalized.properties === 'object' &&
    !Array.isArray(normalized.properties)
  ) {
    const normalizedProperties = Object.fromEntries(
      Object.entries(normalized.properties).map(([key, value]) => [
        key,
        normalizeResponsesSchema(value),
      ]),
    )
    normalized.properties = Object.fromEntries(
      Object.entries(normalizedProperties).map(([key, value]) => [
        key,
        originalRequiredSet.has(key) ? value : makeSchemaNullable(value),
      ]),
    )
    normalized.required = Object.keys(normalizedProperties)
  }

  if (
    (normalized.type === 'object' || 'properties' in normalized) &&
    normalized.additionalProperties === undefined
  ) {
    normalized.additionalProperties = false
    if (normalized.required === undefined) {
      normalized.required = []
    }
  } else if (
    normalized.additionalProperties &&
    typeof normalized.additionalProperties === 'object'
  ) {
    normalized.additionalProperties = normalizeResponsesSchema(
      normalized.additionalProperties,
    )
  }

  if ('items' in normalized) {
    normalized.items = normalizeResponsesSchema(normalized.items)
  }

  for (const key of ['anyOf', 'allOf', 'oneOf', 'prefixItems']) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key].map(item => normalizeResponsesSchema(item))
    }
  }

  if ('not' in normalized) {
    normalized.not = normalizeResponsesSchema(normalized.not)
  }

  if (
    normalized.$defs &&
    typeof normalized.$defs === 'object' &&
    !Array.isArray(normalized.$defs)
  ) {
    normalized.$defs = Object.fromEntries(
      Object.entries(normalized.$defs).map(([key, value]) => [
        key,
        normalizeResponsesSchema(value),
      ]),
    )
  }

  return normalized
}

function schemaAllowsNull(schema: Record<string, unknown>): boolean {
  if (schema.type === 'null') {
    return true
  }

  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    return true
  }

  if (Array.isArray(schema.enum) && schema.enum.includes(null)) {
    return true
  }

  for (const key of ['anyOf', 'oneOf']) {
    if (
      Array.isArray(schema[key]) &&
      schema[key].some(
        value =>
          value != null &&
          typeof value === 'object' &&
          schemaAllowsNull(value as Record<string, unknown>),
      )
    ) {
      return true
    }
  }

  return false
}

function makeSchemaNullable(schema: unknown): unknown {
  if (schema == null || typeof schema !== 'object' || Array.isArray(schema)) {
    return {
      anyOf: [schema, { type: 'null' }],
    }
  }

  const normalized = { ...(schema as Record<string, unknown>) }

  if (schemaAllowsNull(normalized)) {
    return normalized
  }

  if (typeof normalized.type === 'string') {
    return {
      ...normalized,
      type: [normalized.type, 'null'],
    }
  }

  if (Array.isArray(normalized.type)) {
    return normalized.type.includes('null')
      ? normalized
      : {
          ...normalized,
          type: [...normalized.type, 'null'],
        }
  }

  if (Array.isArray(normalized.anyOf)) {
    return {
      ...normalized,
      anyOf: [...normalized.anyOf, { type: 'null' }],
    }
  }

  if (Array.isArray(normalized.oneOf)) {
    return {
      ...normalized,
      oneOf: [...normalized.oneOf, { type: 'null' }],
    }
  }

  return {
    anyOf: [normalized, { type: 'null' }],
  }
}

/**
 * Convert Anthropic tool schemas to Responses API function tools.
 *
 * The Responses API expects function metadata at the top level and is stricter
 * about object schemas, so we normalize object definitions to include
 * additionalProperties=false when absent.
 */
export function anthropicToolsToOpenAIResponses(
  tools: BetaToolUnion[],
): FunctionTool[] {
  return tools
    .filter(tool => {
      return tool.type === 'custom' || !('type' in tool) || tool.type !== 'server'
    })
    .map(tool => {
      const anyTool = tool as Record<string, unknown>
      const name = (anyTool.name as string) || ''
      const description = (anyTool.description as string) || ''
      const inputSchema =
        (anyTool.input_schema as Record<string, unknown> | undefined) || {
          type: 'object',
          properties: {},
        }

      return {
        type: 'function',
        name,
        description,
        parameters: normalizeResponsesSchema(inputSchema) as Record<string, unknown>,
        strict: true,
      } satisfies FunctionTool
    })
}

/**
 * Map Anthropic tool_choice to OpenAI tool_choice format.
 *
 * Anthropic → OpenAI:
 * - { type: "auto" } → "auto"
 * - { type: "any" }  → "required"
 * - { type: "tool", name } → { type: "function", function: { name } }
 * - undefined → undefined (use provider default)
 */
export function anthropicToolChoiceToOpenAI(
  toolChoice: unknown,
): string | { type: 'function'; function: { name: string } } | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const tc = toolChoice as Record<string, unknown>
  const type = tc.type as string

  switch (type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'tool':
      return {
        type: 'function',
        function: { name: tc.name as string },
      }
    default:
      return undefined
  }
}

export function anthropicToolChoiceToOpenAIResponses(
  toolChoice: unknown,
): ToolChoiceOptions | ToolChoiceFunction | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const tc = toolChoice as Record<string, unknown>
  const type = tc.type as string

  switch (type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'tool':
      return {
        type: 'function',
        name: tc.name as string,
      }
    default:
      return undefined
  }
}
