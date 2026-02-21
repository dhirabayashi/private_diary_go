import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../ui/Button'
import { Label, Textarea, FieldError } from '../ui/Input'

const today = () => new Date().toISOString().split('T')[0]

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
    .refine((d) => d <= today(), { message: '未来の日付は選択できません' }),
  body: z.string().min(1, '本文を入力してください'),
})

type FormValues = z.infer<typeof schema>

interface EntryFormProps {
  defaultValues?: Partial<FormValues>
  onSubmit: (values: FormValues) => Promise<void>
  submitLabel?: string
  dateReadOnly?: boolean
}

export function EntryForm({
  defaultValues,
  onSubmit,
  submitLabel = '投稿する',
  dateReadOnly = false,
}: EntryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today(), ...defaultValues },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <Label htmlFor="date" required>日付</Label>
        <input
          id="date"
          type="date"
          max={today()}
          readOnly={dateReadOnly}
          className={`block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm
            focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 sm:text-sm
            ${dateReadOnly ? 'bg-stone-50 cursor-not-allowed' : ''}`}
          {...register('date')}
        />
        <FieldError message={errors.date?.message} />
      </div>

      <div>
        <Label htmlFor="body" required>本文</Label>
        <Textarea
          id="body"
          rows={14}
          placeholder="今日の出来事を書いてみましょう..."
          {...register('body')}
        />
        <FieldError message={errors.body?.message} />
      </div>

      <Button type="submit" loading={isSubmitting} size="lg">
        {submitLabel}
      </Button>
    </form>
  )
}
