import { useNavigate } from 'react-router-dom'
import ProgressRing from './ui/ProgressRing'
import StatusBadge from './ui/StatusBadge'
import { MEMBER_STATUS, PROJECT_MEMBER_ROLE } from '../lib/statusConfig'

export default function TeamMemberCard({ member, rank }) {
  const navigate = useNavigate()
  const initials = member.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div
      onClick={() => navigate(`/admin/team-performance/${member.id}`)}
      className="bg-gray-800 border border-gray-600 rounded-2xl shadow-lg bento-hover p-4 cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        {rank && (
          <span className="w-6 h-6 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
            {rank}
          </span>
        )}
        <span className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white truncate">{member.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{member.email}</p>
        </div>
        <StatusBadge domain={MEMBER_STATUS} value={member.status} dot size="sm" />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <ProgressRing percent={member.performanceScore} size={44} strokeColor="stroke-blue-500" label={String(member.performanceScore)} />
        <div className="flex-1 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-white font-semibold">{member.completed}/{member.total}</p>
            <p className="text-gray-500">Tasks done</p>
          </div>
          <div>
            <p className="text-white font-semibold">{member.testsExecuted}</p>
            <p className="text-gray-500">Tests run</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-750">
        <StatusBadge domain={PROJECT_MEMBER_ROLE} value={member.role} size="sm" />
        <span className="text-gray-500">{member.activeProjects} project{member.activeProjects === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
