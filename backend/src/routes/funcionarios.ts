import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';

const router = Router();

const parseData = (v: any) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

// GET /api/funcionarios - Lista funcionários (com busca)
router.get('/', async (req: any, res: any) => {
    const { busca } = req.query;

    const where = busca
        ? {
            OR: [
                { name: { contains: String(busca), mode: 'insensitive' as const } },
                { document: { contains: String(busca) } },
                { code: { contains: String(busca), mode: 'insensitive' as const } },
                { role: { contains: String(busca), mode: 'insensitive' as const } },
                { department: { contains: String(busca), mode: 'insensitive' as const } }
            ]
        }
        : {};

    const funcionarios = await prisma.employee.findMany({
        where,
        orderBy: { name: 'asc' }
    });

    return res.json(funcionarios.map(f => ({
        id: f.id,
        codigo: f.code,
        nome: f.name,
        documento: f.document,
        rg: f.rg,
        nascimento: f.birthDate,
        sexo: f.gender,
        estadoCivil: f.maritalStatus,
        email: f.email,
        telefone: f.phone,
        celular: f.cellphone,
        endereco: f.address,
        numero: f.number,
        complemento: f.complement,
        bairro: f.neighborhood,
        cidade: f.city,
        estado: f.state,
        cep: f.zipCode,
        cargo: f.role,
        departamento: f.department,
        admissao: f.hireDate,
        demissao: f.terminationDate,
        salario: Number(f.salary),
        comissao: Number(f.commissionRate),
        valeTransporte: Number(f.valeTransport),
        valeAlimentacao: Number(f.valeAlimentacao),
        banco: f.bank,
        agencia: f.agency,
        conta: f.account,
        tipoConta: f.accountType,
        formaPagamento: f.paymentMethod,
        observacoes: f.notes,
        ativo: f.isActive
    })));
});

// POST /api/funcionarios - Cria um novo funcionário
router.post('/', async (req: any, res: any) => {
    const { codigo, nome, documento, rg, nascimento, sexo, estadoCivil, email, telefone, celular, endereco, numero, complemento, bairro, cidade, estado, cep, cargo, departamento, admissao, salario, comissao, valeTransporte, valeAlimentacao, banco, agencia, conta, tipoConta, formaPagamento, observacoes } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome do funcionário!" });
    }

    if (documento) {
        const dup = await prisma.employee.findFirst({ where: { document: documento } });
        if (dup) {
            return res.status(400).json({ erro: "Documento já cadastrado!" });
        }
    }

    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const funcionario = await prisma.employee.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            code: codigo || null,
            name: nome.trim().toUpperCase(),
            document: documento || null,
            rg: rg || null,
            birthDate: parseData(nascimento),
            gender: sexo || null,
            maritalStatus: estadoCivil || null,
            email: email || null,
            phone: telefone || null,
            cellphone: celular || null,
            address: endereco || null,
            number: numero || null,
            complement: complemento || null,
            neighborhood: bairro || null,
            city: cidade || null,
            state: estado || null,
            zipCode: cep || null,
            role: cargo || null,
            department: departamento || null,
            hireDate: parseData(admissao),
            salary: Number(salario) || 0,
            commissionRate: Number(comissao) || 0,
            valeTransport: Number(valeTransporte) || 0,
            valeAlimentacao: Number(valeAlimentacao) || 0,
            bank: banco || null,
            agency: agencia || null,
            account: conta || null,
            accountType: tipoConta || null,
            paymentMethod: formaPagamento || null,
            notes: observacoes || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: funcionario.id, nome: funcionario.name });
});

// PUT /api/funcionarios/:id - Atualiza um funcionário
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { codigo, nome, documento, rg, nascimento, sexo, estadoCivil, email, telefone, celular, endereco, numero, complemento, bairro, cidade, estado, cep, cargo, departamento, admissao, demissao, salario, comissao, valeTransporte, valeAlimentacao, banco, agencia, conta, tipoConta, formaPagamento, observacoes, ativo } = req.body;

    const existente = await prisma.employee.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Funcionário não encontrado!" });
    }

    if (documento && documento !== existente.document) {
        const dup = await prisma.employee.findFirst({ where: { document: documento } });
        if (dup) {
            return res.status(400).json({ erro: "Documento já cadastrado!" });
        }
    }

    const funcionario = await prisma.employee.update({
        where: { id },
        data: {
            code: codigo !== undefined ? (codigo || null) : existente.code,
            name: nome !== undefined ? nome.trim().toUpperCase() : existente.name,
            document: documento !== undefined ? (documento || null) : existente.document,
            rg: rg !== undefined ? (rg || null) : existente.rg,
            birthDate: nascimento !== undefined ? parseData(nascimento) : existente.birthDate,
            gender: sexo !== undefined ? (sexo || null) : existente.gender,
            maritalStatus: estadoCivil !== undefined ? (estadoCivil || null) : existente.maritalStatus,
            email: email !== undefined ? (email || null) : existente.email,
            phone: telefone !== undefined ? (telefone || null) : existente.phone,
            cellphone: celular !== undefined ? (celular || null) : existente.cellphone,
            address: endereco !== undefined ? (endereco || null) : existente.address,
            number: numero !== undefined ? (numero || null) : existente.number,
            complement: complemento !== undefined ? (complemento || null) : existente.complement,
            neighborhood: bairro !== undefined ? (bairro || null) : existente.neighborhood,
            city: cidade !== undefined ? (cidade || null) : existente.city,
            state: estado !== undefined ? (estado || null) : existente.state,
            zipCode: cep !== undefined ? (cep || null) : existente.zipCode,
            role: cargo !== undefined ? (cargo || null) : existente.role,
            department: departamento !== undefined ? (departamento || null) : existente.department,
            hireDate: admissao !== undefined ? parseData(admissao) : existente.hireDate,
            terminationDate: demissao !== undefined ? parseData(demissao) : existente.terminationDate,
            salary: salario !== undefined ? (Number(salario) || 0) : existente.salary,
            commissionRate: comissao !== undefined ? (Number(comissao) || 0) : existente.commissionRate,
            valeTransport: valeTransporte !== undefined ? (Number(valeTransporte) || 0) : existente.valeTransport,
            valeAlimentacao: valeAlimentacao !== undefined ? (Number(valeAlimentacao) || 0) : existente.valeAlimentacao,
            bank: banco !== undefined ? (banco || null) : existente.bank,
            agency: agencia !== undefined ? (agencia || null) : existente.agency,
            account: conta !== undefined ? (conta || null) : existente.account,
            accountType: tipoConta !== undefined ? (tipoConta || null) : existente.accountType,
            paymentMethod: formaPagamento !== undefined ? (formaPagamento || null) : existente.paymentMethod,
            notes: observacoes !== undefined ? (observacoes || null) : existente.notes,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });

    return res.json({ id: funcionario.id, nome: funcionario.name });
});

// DELETE /api/funcionarios/:id - Exclui um funcionário
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;

    const existente = await prisma.employee.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Funcionário não encontrado!" });
    }

    await prisma.employee.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
