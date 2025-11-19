import { 
  Home, Search, Settings, MessageSquare, FileText, BarChart3, FileCode, Link2, Users, 
  Sparkles, ChevronDown, Play, Info, CreditCard, Key, ExternalLink, BookOpen, Grid3x3, Zap 
} from 'lucide-react'
import { LucideIcon } from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  Home,
  Search,
  Settings,
  MessageSquare,
  FileText,
  BarChart3,
  FileCode,
  Link2,
  Users,
  Sparkles,
  ChevronDown,
  Play,
  Info,
  CreditCard,
  Key,
  ExternalLink,
  BookOpen,
  Grid3x3,
  Zap,
}

export function getIcon(name: string): LucideIcon | undefined {
  return iconMap[name]
}

