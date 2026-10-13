# Print one subtree of a bridge get_node JSON dump: figma-subtree.py <node.json> <nodeId> <depth>
import os, sys

f, nid, maxd = sys.argv[1], sys.argv[2], int(sys.argv[3])
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "figma-tree.py")).read().split("walk(d)")[0]
sys.argv = [None, f, str(maxd)]
exec(src)


def find(n):
    if n["id"] == nid:
        return n
    for c in n.get("children", []) or []:
        r = find(c)
        if r:
            return r


walk(find(d))
