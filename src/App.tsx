import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { TitleDetail } from './pages/TitleDetail'
import { Person } from './pages/Person'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Calendar } from './pages/Calendar'
import { History } from './pages/History'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/calendar', element: <Calendar /> },
      { path: '/search', element: <Search /> },
      { path: '/title/:mediaType/:id', element: <TitleDetail /> },
      { path: '/person/:id', element: <Person /> },
      { path: '/history', element: <History /> },
      { path: '/profile', element: <Profile /> },
      { path: '/settings', element: <Settings /> },
      { path: '/stats', element: <Stats /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
