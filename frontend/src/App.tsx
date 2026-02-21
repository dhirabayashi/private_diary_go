import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './components/ui/Toast'
import { TopPage } from './pages/TopPage'
import { NewEntryPage } from './pages/NewEntryPage'
import { EntryDetailPage } from './pages/EntryDetailPage'
import { EditEntryPage } from './pages/EditEntryPage'
import { SearchPage } from './pages/SearchPage'
import { ImportPage } from './pages/ImportPage'
import { ExportPage } from './pages/ExportPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const router = createBrowserRouter([
  { path: '/', element: <TopPage /> },
  { path: '/new', element: <NewEntryPage /> },
  { path: '/search', element: <SearchPage /> },
  { path: '/import', element: <ImportPage /> },
  { path: '/export', element: <ExportPage /> },
  { path: '/:date', element: <EntryDetailPage /> },
  { path: '/:date/edit', element: <EditEntryPage /> },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  )
}
