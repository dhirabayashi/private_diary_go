import { createRef } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EntryForm, type EntryFormHandle } from './EntryForm'
import { useAutoSave } from '../../hooks/useAutoSave'

vi.mock('../../hooks/useAutoSave')

const mockUseAutoSave = vi.mocked(useAutoSave)

const baseAutoSave = {
  status: 'idle' as const,
  autoCreated: false,
  getCreatedDate: () => null,
  save: vi.fn().mockResolvedValue(undefined),
  reloadFromServer: vi.fn(),
  forceSave: vi.fn().mockResolvedValue(undefined),
}

describe('EntryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave })
  })

  it('conflict状態でなければ競合バナーを表示しない', () => {
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('autoSaveStatusがconflictのとき競合バナーを表示する', () => {
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict' })
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新の内容を読み込み直す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'このまま自分の内容で保存する' })).toBeInTheDocument()
  })

  it('conflict状態のとき投稿ボタンが無効化される', () => {
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict' })
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)

    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
  })

  it('conflict状態でなければ投稿ボタンは無効化されない', () => {
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    expect(screen.getByRole('button', { name: '投稿する' })).not.toBeDisabled()
  })

  it('「最新の内容を読み込み直す」クリックで本文フィールドがreloadFromServerの返り値に置き換わる', async () => {
    const reloadFromServer = vi.fn().mockResolvedValue({ body: 'サーバー側の最新内容', version: 5 })
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', reloadFromServer })

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '自分の入力内容' }} />)

    fireEvent.click(screen.getByRole('button', { name: '最新の内容を読み込み直す' }))

    await waitFor(() => {
      expect(screen.getByLabelText(/本文/)).toHaveValue('サーバー側の最新内容')
    })
    expect(reloadFromServer).toHaveBeenCalledTimes(1)
  })

  it('「最新の内容を読み込み直す」がエラーで失敗しても例外が伝播せず、バナーが表示され続ける', async () => {
    const reloadFromServer = vi.fn().mockRejectedValue(new Error('network error'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', reloadFromServer })

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '自分の入力内容' }} />)
    fireEvent.click(screen.getByRole('button', { name: '最新の内容を読み込み直す' }))

    await waitFor(() => expect(reloadFromServer).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText(/本文/)).toHaveValue('自分の入力内容')

    consoleErrorSpy.mockRestore()
  })

  it('「このまま自分の内容で保存する」は確認ダイアログでキャンセルするとforceSaveを呼ばない', () => {
    const forceSave = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', forceSave })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'このまま自分の内容で保存する' }))

    expect(forceSave).not.toHaveBeenCalled()
  })

  it('「このまま自分の内容で保存する」は確認ダイアログで承認するとforceSaveを呼ぶ', async () => {
    const forceSave = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', forceSave })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'このまま自分の内容で保存する' }))

    await waitFor(() => expect(forceSave).toHaveBeenCalledTimes(1))
  })

  it('本文が空白文字のみのとき送信してもonSubmitが呼ばれず、バリデーションエラーが表示される', async () => {
    const onSubmit = vi.fn()
    render(<EntryForm onSubmit={onSubmit} defaultValues={{ body: '   ' }} />)

    fireEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await waitFor(() => {
      expect(screen.getByText('本文を入力してください')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('EntryFormHandle.save/isAutoCreated がuseAutoSaveの戻り値を反映する', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, save, autoCreated: true })
    const ref = createRef<EntryFormHandle>()

    render(<EntryForm ref={ref} onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)

    expect(ref.current?.isAutoCreated()).toBe(true)
    ref.current?.save()
    expect(save).toHaveBeenCalledTimes(1)
  })
})
