import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { TitleDetail } from './pages/TitleDetail'
import { Profile } from './pages/Profile'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/search', element: <Search /> },
      { path: '/title/:mediaType/:id', element: <TitleDetail /> },
      { path: '/profile', element: <Profile /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
