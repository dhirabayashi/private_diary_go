import { forwardRef, useImperativeHandle } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../ui/Button'
import { Label, Textarea, FieldError } from '../ui/Input'
import { useAutoSave } from '../../hooks/useAutoSave'

// 'sv'（スウェーデン）ロケールは YYYY-MM-DD 形式を返すため、JST 日付を簡潔に取得するために利用している
const today = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
    .refine((d) => d <= today(), { message: '未来の日付は選択できません' }),
  body: z.string().min(1, '本文を入力してください'),
})

type FormValues = z.infer<typeof schema>

// 手動投稿時に競合を避けるために呼び出す口
export interface EntryFormHandle {
  getCreatedDate: () => string | null
  awaitCurrentSave: () => Promise<void>
}

interface EntryFormProps {
  defaultValues?: Partial<FormValues>
  onSubmit: (values: FormValues) => Promise<void>
  submitLabel?: string
  dateReadOnly?: boolean
  autoSaveExistingDate?: string
}

export const EntryForm = forwardRef<EntryFormHandle, EntryFormProps>(
  function EntryForm(
    {
      defaultValues,
      onSubmit,
      submitLabel = '投稿する',
      dateReadOnly = false,
      autoSaveExistingDate,
    },
    ref,
  ) {
    const {
      register,
      handleSubmit,
      watch,
      formState: { errors, isSubmitting },
    } = useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { date: today(), ...defaultValues },
    })

    const watchedDate = watch('date')
    const watchedBody = watch('body')

    const { status: autoSaveStatus, autoCreated, getCreatedDate, awaitCurrentSave } = useAutoSave({
      date: watchedDate ?? '',
      body: watchedBody ?? '',
      existingDate: autoSaveExistingDate,
      initialBody: defaultValues?.body,
    })

    useImperativeHandle(ref, () => ({ getCreatedDate, awaitCurrentSave }))

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="date" required>日付</Label>
          <input
            id="date"
            type="date"
            max={today()}
            readOnly={dateReadOnly || autoCreated}
            className={`block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm
              focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 sm:text-sm
              ${dateReadOnly || autoCreated ? 'bg-stone-50 cursor-not-allowed' : ''}`}
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

        <div className="flex items-center gap-4">
          <Button type="submit" loading={isSubmitting} size="lg">
            {submitLabel}
          </Button>
          <span className="text-xs text-stone-400">
            {autoSaveStatus === 'saving' && '自動保存中...'}
            {autoSaveStatus === 'saved' && '自動保存しました'}
            {autoSaveStatus === 'error' && (
              <span className="text-red-400">自動保存に失敗しました</span>
            )}
          </span>
        </div>
      </form>
    )
  },
)
