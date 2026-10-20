import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/lib/api/app';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { t } from '@/i18n';
export function TagInput({
  value,
  onChange,
  id = 'tags',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
}) {
  const [text, setText] = useState('');
  const tags = useQuery({ queryKey: ['tags'], queryFn: appApi.tags });
  const add = (text: string) => {
    const name = text.trim();
    if (name && !value.some((v) => v.toLowerCase() === name.toLowerCase()))
      onChange([...value, name]);
    setText('');
  };
  return (
    <div className="tag-input">
      <div className="tag-values">
        {value.map((name) => (
          <Badge key={name} variant="secondary">
            {name}
            <button
              type="button"
              aria-label={`${t('common.removeTag')} ${name}`}
              onClick={() => onChange(value.filter((tag) => tag !== name))}
            >
              <X />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        id={id}
        value={text}
        list={`${id}-suggestions`}
        placeholder={t('common.addTag')}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim()) add(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(text);
          }
        }}
      />
      <datalist id={`${id}-suggestions`}>
        {tags.data?.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>
    </div>
  );
}
