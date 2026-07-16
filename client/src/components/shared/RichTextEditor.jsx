import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Link2, Undo, Redo, Braces } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';

const VARIABLES = [
  'first_name', 'last_name', 'company', 'job_title', 'city', 'country',
  'sender_name', 'appointment_link',
];

/** TipTap rich text editor with a variables menu; emits HTML via onChange. */
export function RichTextEditor({ value, onChange, placeholder = 'Write your email…', className, minHeight = 180 }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange?.(e.isEmpty ? '' : e.getHTML()),
  });

  // Keep external value in sync (e.g. when loading a template)
  React.useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return;
    if (url === '') return editor.chain().focus().unsetLink().run();
    editor.chain().focus().setLink({ href: url }).run();
  };

  const ToolbarBtn = ({ active, onClick, children, title }) => (
    <Button type="button" variant={active ? 'secondary' : 'ghost'} size="iconSm" onClick={onClick} title={title} className="h-7 w-7">
      {children}
    </Button>
  );

  return (
    <div className={cn('rounded-md border border-input bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring', className)}>
      <div className="flex items-center gap-0.5 border-b px-2 py-1 flex-wrap">
        <ToolbarBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolbarBtn>
        <ToolbarBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarBtn>
        <ToolbarBtn title="Link" active={editor.isActive('link')} onClick={setLink}><Link2 /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs"><Braces className="h-3.5 w-3.5" /> Variables</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel>Insert variable</DropdownMenuLabel>
            {VARIABLES.map((v) => (
              <DropdownMenuItem key={v} onClick={() => editor.chain().focus().insertContent(`{{${v}}}`).run()}>
                <code className="text-xs">{`{{${v}}}`}</code>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().insertContent('{{first_name | default: "there"}}').run()}>
              <code className="text-xs">{'{{first_name | default: "there"}}'}</code>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo /></ToolbarBtn>
          <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo /></ToolbarBtn>
        </div>
      </div>
      <EditorContent editor={editor} style={{ minHeight }} className="[&_.tiptap]:outline-none cursor-text" onClick={() => editor.chain().focus().run()} />
    </div>
  );
}
