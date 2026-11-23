from collections import namedtuple

Member = namedtuple("Member", "id name role")

RAW = """id,name,role
1,Ana,member
2,Boris,staff
3,Cleo,member"""


def load():
    members = {}
    for line in RAW.splitlines()[1:]:
        mid, name, role = line.split(",")
        members[int(mid)] = Member(int(mid), name, role.strip().capitalize())
    return members
