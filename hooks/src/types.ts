/**
 * Windsurf hook event types.
 * Different from Cursor: uses agent_action_name and tool_info.
 */

export interface WindsurfHookEvent {
  agent_action_name: string;
  trajectory_id?: string;
  execution_id?: string;
  timestamp?: string;
  tool_info?: {
    file_path?: string;
    edits?: Array<{ old_string: string; new_string: string }>;
    command_line?: string;
    cwd?: string;
    user_prompt?: string;
    response?: string;
    mcp_server_name?: string;
    mcp_tool_name?: string;
    mcp_tool_arguments?: Record<string, unknown>;
    mcp_result?: string;
    transcript_path?: string;
    worktree_path?: string;
    root_workspace_path?: string;
  };
}

export interface WindsurfHookResponse {
  // Exit code 2 = block. Stdout shown as message.
  [key: string]: unknown;
}
