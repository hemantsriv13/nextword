import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** Keeps one broken workspace from blanking the whole Lab. */
export class WorkspaceBoundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { name: string }) {
    if (prev.name !== this.props.name && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const stale = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(this.state.error.message)
    return (
      <div role="alert" className="flex max-w-xl flex-col gap-3 p-6">
        <h1 className="text-[22px] font-semibold">This workspace didn&apos;t load</h1>
        <p className="text-prose">{stale ? "The Lab was rebuilt since this page opened. Reloading picks up the new version." : this.state.error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          {!stale && <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>}
        </div>
      </div>
    )
  }
}
