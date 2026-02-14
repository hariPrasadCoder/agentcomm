import { useEffect } from 'react'
import { AuthPage } from '@/pages/Auth'
import { OnboardingPage } from '@/pages/Onboarding'
import { DashboardPage } from '@/pages/Dashboard'
import useStore from '@/store'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading AgentComm...</p>
      </div>
    </div>
  )
}

export default function App() {
  const { isLoading, isAuthenticated, user, organization, initialize } = useStore()
  
  useEffect(() => {
    initialize()
  }, [initialize])
  
  if (isLoading) {
    return <LoadingScreen />
  }
  
  // Not authenticated -> show login/signup
  if (!isAuthenticated) {
    return <AuthPage />
  }
  
  // Authenticated but no org -> show onboarding
  if (!user?.org_id || !organization) {
    return <OnboardingPage />
  }
  
  // Fully set up -> show dashboard
  return <DashboardPage />
}
