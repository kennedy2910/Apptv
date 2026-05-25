from pathlib import Path
p = Path('/root/apptv/App.tsx')
text = p.read_text(encoding='utf-8')

text = text.replace(
"  const clampExpandedOffset = useCallback((item: PlaylistItem, nextOffset: number) => {\n    const duration = Number(item.duration || 0);\n    const maxOffset = duration > 0 ? Math.max(0, duration - 0.25) : 0;\n    return Math.min(Math.max(0, nextOffset), maxOffset);\n  }, []);\n\n  const getExpandedEffectiveOffset = useCallback((anchor: ExpandedSeekAnchor | null, playback: LivePlayback, currentNow: number) => {\n",
"  const clampExpandedOffset = useCallback((item: PlaylistItem, nextOffset: number) => {\n    const duration = Number(item.duration || 0);\n    const maxOffset = duration > 0 ? Math.max(0, duration - 0.25) : 0;\n    return Math.min(Math.max(0, nextOffset), maxOffset);\n  }, []);\n\n  const getExpandedMaxOffset = useCallback((channelIndex: number, playback: LivePlayback) => {\n    const duration = Number(playback.item.duration || 0);\n    const itemMaxOffset = duration > 0 ? Math.max(0, duration - 0.25) : 0;\n    const channel = state.channels[channelIndex];\n    if (!channel) return itemMaxOffset;\n\n    const livePlayback = getLivePlaybackState(channel);\n    if (!livePlayback) return itemMaxOffset;\n    if (livePlayback.index !== playback.index) return itemMaxOffset;\n\n    return Math.min(itemMaxOffset, Math.max(0, livePlayback.offset));\n  }, [getLivePlaybackState, state.channels]);\n\n  const getExpandedEffectiveOffset = useCallback((anchor: ExpandedSeekAnchor | null, playback: LivePlayback, currentNow: number) => {\n"
)

text = text.replace(
"      return clampExpandedOffset(\n        playback.item,\n        anchor.baseOffset + Math.max(0, (currentNow - anchor.startedAtMs) / 1000),\n      );\n    }\n\n    return clampExpandedOffset(playback.item, playback.offset);\n  }, [clampExpandedOffset, expandedPlayback]);\n",
"      return Math.min(\n        clampExpandedOffset(\n          playback.item,\n          anchor.baseOffset + Math.max(0, (currentNow - anchor.startedAtMs) / 1000),\n        ),\n        getExpandedMaxOffset(expandedPlayback.channelIndex, playback),\n      );\n    }\n\n    return Math.min(\n      clampExpandedOffset(playback.item, playback.offset),\n      expandedPlayback ? getExpandedMaxOffset(expandedPlayback.channelIndex, playback) : clampExpandedOffset(playback.item, playback.offset),\n    );\n  }, [clampExpandedOffset, expandedPlayback, getExpandedMaxOffset]);\n"
)

text = text.replace(
"    const currentOffset = getExpandedEffectiveOffset(expandedSeekAnchor, expandedPlayback.playback, Date.now());\n    const nextOffset = clampExpandedOffset(expandedPlayback.playback.item, currentOffset + deltaSeconds);\n",
"    const currentOffset = getExpandedEffectiveOffset(expandedSeekAnchor, expandedPlayback.playback, Date.now());\n    const nextOffset = Math.min(\n      clampExpandedOffset(expandedPlayback.playback.item, currentOffset + deltaSeconds),\n      getExpandedMaxOffset(expandedPlayback.channelIndex, expandedPlayback.playback),\n    );\n"
)

text = text.replace(
"  }, [clampExpandedOffset, expandedPlayback, expandedSeekAnchor, getExpandedEffectiveOffset, showExpandedInfo]);\n",
"  }, [clampExpandedOffset, expandedPlayback, expandedSeekAnchor, getExpandedEffectiveOffset, getExpandedMaxOffset, showExpandedInfo]);\n"
)

p.write_text(text, encoding='utf-8')
print('patched-live-cap')
