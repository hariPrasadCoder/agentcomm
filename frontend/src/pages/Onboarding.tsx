import { useState } from 'react'
import { Building2, Users, ArrowRight, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import useStore from '@/store'

type OnboardingStep = 'choice' | 'create' | 'join'

export function OnboardingPage() {
  const { createOrg, joinOrg, user } = useStore()
  const [step, setStep] = useState<OnboardingStep>('choice')
  const [orgName, setOrgName] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdOrg, setCreatedOrg] = useState<{ name: string; inviteCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim()) return
    
    setLoading(true)
    setError('')
    
    try {
      await createOrg(orgName.trim(), orgDescription.trim() || undefined)
    } catch (err: any) {
      setError(err.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }
  
  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    
    setLoading(true)
    setError('')
    
    try {
      await joinOrg(inviteCode.trim())
    } catch (err: any) {
      setError(err.message || 'Invalid invite code')
    } finally {
      setLoading(false)
    }
  }
  
  const copyInviteCode = () => {
    if (createdOrg) {
      navigator.clipboard.writeText(createdOrg.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome, {user?.name}! 👋</h1>
          <p className="text-muted-foreground">
            Let's get you set up with AgentComm
          </p>
        </div>
        
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}
        
        {step === 'choice' && (
          <div className="space-y-4">
            <button
              className="w-full p-6 border rounded-xl text-left hover:border-primary hover:bg-primary/5 transition-colors"
              onClick={() => setStep('create')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Create an Organization</div>
                  <div className="text-sm text-muted-foreground">
                    Start fresh and invite your team
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
            
            <button
              className="w-full p-6 border rounded-xl text-left hover:border-primary hover:bg-primary/5 transition-colors"
              onClick={() => setStep('join')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Join an Organization</div>
                  <div className="text-sm text-muted-foreground">
                    I have an invite code from my team
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
          </div>
        )}
        
        {step === 'create' && (
          <div className="border rounded-xl p-6">
            <button
              className="text-sm text-muted-foreground hover:text-foreground mb-4"
              onClick={() => setStep('choice')}
            >
              ← Back
            </button>
            
            <h2 className="text-xl font-semibold mb-4">Create your organization</h2>
            
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Organization Name</label>
                <Input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., Acme Startup"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Description (optional)</label>
                <Input
                  type="text"
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  placeholder="What does your team do?"
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={loading || !orgName.trim()}>
                {loading ? 'Creating...' : 'Create Organization'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
        
        {step === 'join' && (
          <div className="border rounded-xl p-6">
            <button
              className="text-sm text-muted-foreground hover:text-foreground mb-4"
              onClick={() => setStep('choice')}
            >
              ← Back
            </button>
            
            <h2 className="text-xl font-semibold mb-4">Join your team</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the invite code you received from your team admin
            </p>
            
            <form onSubmit={handleJoinOrg} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Invite Code</label>
                <Input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste your invite code"
                  required
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={loading || !inviteCode.trim()}>
                {loading ? 'Joining...' : 'Join Organization'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
