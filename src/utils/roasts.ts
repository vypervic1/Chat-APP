// Mini roast message generator for save, delete, update, and special user actions
export function getMiniRoastMessage(action: string, details?: string): string {
  switch (action) {
    case 'display_name':
      return details 
        ? `Display name set to "${details}"! Modern day witness protection protocol engaged. 🕵️‍♂️`
        : `Display name updated! Still the same main character syndrome though. 😉`;
    case 'thinking':
      return `Status saved! Deep thoughts... hopefully not for long. 🧠✨`;
    case 'about':
      return `Bio updated! Your 3 profile stalkers are deeply moved. 📝`;
    case 'cover':
      return `Cover photo changed! High-budget aesthetic flex approved. 📸`;
    case 'avatar':
      return `Profile pic updated! Catfish rating increased by 15%. 😼`;
    case 'theme':
      return details 
        ? `Switched to ${details} theme! Pretending this changes your life choices. 🎨` 
        : `Theme updated! Aesthetic upgrade unlocked. 🎨`;
    case 'delete_file':
      return `File banished into the digital void! RIP pixels. 💥`;
    case 'clear_storage':
      return `Local storage wiped clean! Digital minimalism level: Master. 🧹`;
    case 'delete_chat':
      return `Chat history erased! Evidence successfully destroyed. 🕵️`;
    case 'delete_account':
      return `Account deleted! Dramatic main character exit score: 10/10. 🎬`;
    case 'disband_group':
      return `Group disbanded! Total dictator move, respect. 👑`;
    case 'lock_chat':
      return `Chat locked! Secrets guarded like Fort Knox. 🔐`;
    case 'record_voice':
      return `Voice call recorded and saved to device storage! Keeping receipts, I see. 🎙️`;
    case 'record_video':
      return `Video call recorded and saved to device storage! Evidence secured. 🎥`;
    case 'save_media':
      return `Saved to local storage! Stockpiling data like a digital squirrel. 💾`;
    case 'download':
      return details ? `Downloaded ${details}! Hoarding files again, are we? ⬇️` : `File downloaded! Hoarding files again, are we? ⬇️`;
    case 'save_contact_name':
      return `Contact nickname saved! Secret alias registered in the database. 🤫`;
    default:
      return details ? `Action "${action}" completed! ${details}` : `Action saved! Nice move, champion. 😎`;
  }
}
