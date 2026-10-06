// Past conversations are test fixtures, never first-run production content.
export function seedConversations() {
  localStorage.setItem('horizon_chat_sessions', JSON.stringify([
    { id: 'session-1', title: 'Explain compile error in WebGL vertex shader', createdAt: 1, time: '12m ago', messages: [
      { id: 'u1', sender: 'user', text: 'Explain this shader error', timestamp: '18:32' },
      { id: 'a1', sender: 'assistant', text: 'The shader requires a precision declaration.', timestamp: '18:32', status: 'done' },
    ] },
    { id: 'session-2', title: 'Open target repo in VS Code and branch to feature/liquid', createdAt: 2, time: '48m ago', messages: [
      { id: 'u2', sender: 'user', text: 'Open the target repo', timestamp: '17:56' },
      { id: 'a2', sender: 'assistant', text: 'Successfully launched Visual Studio Code targeting workspace.', timestamp: '17:56', status: 'done' },
    ] },
  ]));
  localStorage.setItem('horizon_active_session_id', 'session-1');
}
