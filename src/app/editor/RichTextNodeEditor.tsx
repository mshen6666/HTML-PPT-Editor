import { useEffect, useRef, type ReactElement } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle as TiptapTextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'

type RichTextNodeEditorProps = {
  html: string
  onCommit: (html: string) => void
}

export function RichTextNodeEditor({ html, onCommit }: RichTextNodeEditorProps): ReactElement {
  const lastHtmlRef = useRef(html)
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapTextStyle,
      Color,
    ],
    content: html,
    editorProps: {
      attributes: {
        'aria-label': '文本内容',
        class: 'rich-text-editor',
        role: 'textbox',
      },
    },
    onBlur: ({ editor }) => {
      const nextHtml = normalizeRichTextHtml(editor.getHTML())
      lastHtmlRef.current = nextHtml
      onCommit(nextHtml)
    },
  })

  useEffect(() => {
    if (!editor || html === lastHtmlRef.current) {
      return
    }

    editor.commands.setContent(html, { emitUpdate: false })
    lastHtmlRef.current = html
  }, [editor, html])

  return (
    <div className="rich-text-shell">
      <EditorContent editor={editor} />
    </div>
  )
}

function normalizeRichTextHtml(html: string): string {
  return html === '<p></p>' ? '' : html
}
