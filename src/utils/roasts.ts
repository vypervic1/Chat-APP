// Single-word status message generator for action feedback
export function getMiniRoastMessage(action: string, _details?: string): string {
  switch (action) {
    case 'display_name':
      return 'Updated';
    case 'thinking':
      return 'Saved';
    case 'about':
      return 'Saved';
    case 'cover':
      return 'Updated';
    case 'avatar':
      return 'Updated';
    case 'theme':
      return 'Applied';
    case 'delete_file':
      return 'Deleted';
    case 'clear_storage':
      return 'Cleared';
    case 'delete_chat':
      return 'Deleted';
    case 'delete_account':
      return 'Removed';
    case 'disband_group':
      return 'Disbanded';
    case 'lock_chat':
      return 'Locked';
    case 'record_voice':
      return 'Recorded';
    case 'record_video':
      return 'Recorded';
    case 'save_media':
      return 'Saved';
    case 'download':
      return 'Downloaded';
    case 'save_contact_name':
      return 'Saved';
    default:
      return 'Saved';
  }
}
