import { supabase } from './supabaseClient'

function detectFileType(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

// Uploads a single file to the issue-attachments bucket and inserts a row
// into the attachments table pointing at it. Returns the attachment row.
export async function uploadAttachment(file, issueId, userId) {
  const fileExt = file.name.split('.').pop()
  const path = `${issueId}/${crypto.randomUUID()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('issue-attachments')
    .upload(path, file)

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('issue-attachments')
    .getPublicUrl(path)

  const { data, error: insertError } = await supabase
    .from('attachments')
    .insert({
      issue_id: issueId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: detectFileType(file),
      uploaded_by: userId,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return data
}

export async function deleteAttachment(attachment) {
  // Best-effort storage cleanup — extract the path after the bucket name
  try {
    const url = new URL(attachment.file_url)
    const marker = '/issue-attachments/'
    const idx = url.pathname.indexOf(marker)
    if (idx !== -1) {
      const path = url.pathname.slice(idx + marker.length)
      await supabase.storage.from('issue-attachments').remove([path])
    }
  } catch {
    // ignore storage cleanup failures, still remove the DB row below
  }
  await supabase.from('attachments').delete().eq('id', attachment.id)
}
